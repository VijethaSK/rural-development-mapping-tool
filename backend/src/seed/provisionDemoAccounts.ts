import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { env } from '../config/env.js';
import { AdminUser, PdoUser, User } from '../models/User.js';
import { Panchayat } from '../models/Panchayat.js';

const PASSWORD_COST = 10;
const EXPECTED_DATABASE = 'rdmt';
const NONLOCAL_CONFIRMATION = 'I_UNDERSTAND_THIS_CREATES_DEMO_ACCOUNTS';
const EXPECTED_EXISTING_ADMIN = {
  username: 'admin',
  email: 'admin@varthur.gov.in',
  role: 'admin',
  panchayatName: 'Varthur Gram Panchayat',
  isDemoAccount: false,
  permissions: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type ProvisioningAccount = {
  username: string;
  email: string;
  role: 'admin' | 'pdo';
  name: string;
  panchayatName?: string;
  passwordEnv: string;
};

export const DEMO_ACCOUNTS: ProvisioningAccount[] = [
  {
    username: 'pdo.adyar',
    email: 'pdo.adyar@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Adyar',
    panchayatName: 'Adyar',
    passwordEnv: 'RDMT_DEMO_PDO_ADYAR_PASSWORD'
  },
  {
    username: 'pdo.harekala',
    email: 'pdo.harekala@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Harekala',
    panchayatName: 'Harekala',
    passwordEnv: 'RDMT_DEMO_PDO_HAREKALA_PASSWORD'
  },
  {
    username: 'pdo.neermarga',
    email: 'pdo.neermarga@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Neermarga',
    panchayatName: 'Neermarga',
    passwordEnv: 'RDMT_DEMO_PDO_NEERMARGA_PASSWORD'
  },
  {
    username: 'pdo.pavuru',
    email: 'pdo.pavuru@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Pavuru',
    panchayatName: 'Pavuru',
    passwordEnv: 'RDMT_DEMO_PDO_PAVURU_PASSWORD'
  },
  {
    username: 'pdo.pudu',
    email: 'pdo.pudu@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Pudu',
    panchayatName: 'Pudu',
    passwordEnv: 'RDMT_DEMO_PDO_PUDU_PASSWORD'
  },
  {
    username: 'pdo.varthur',
    email: 'pdo.varthur@rdmt.invalid',
    role: 'pdo',
    name: 'PDO - Varthur Gram Panchayat',
    // "Varthur" is the requested shorthand; the repository's canonical name
    // for the target Panchayat is "Varthur Gram Panchayat".
    panchayatName: 'Varthur Gram Panchayat',
    passwordEnv: 'RDMT_DEMO_PDO_VARTHUR_PASSWORD'
  }
];

export function assertKnownExistingAdmin(
  admin: {
    username?: string;
    email?: string;
    role?: string;
    panchayatId?: unknown;
    isDemoAccount?: boolean;
    permissions?: string[];
  } | null | undefined,
  expectedPanchayatId: unknown,
  isAdminUserDiscriminator: boolean
): void {
  const permissions = [...(admin?.permissions || [])].sort();
  const expectedPermissions = [...EXPECTED_EXISTING_ADMIN.permissions].sort();
  if (!admin ||
      !isAdminUserDiscriminator ||
      admin.username?.toLowerCase() !== EXPECTED_EXISTING_ADMIN.username ||
      admin.email?.toLowerCase() !== EXPECTED_EXISTING_ADMIN.email ||
      admin.role !== EXPECTED_EXISTING_ADMIN.role ||
      String(admin.panchayatId || '') !== String(expectedPanchayatId || '') ||
      admin.isDemoAccount !== EXPECTED_EXISTING_ADMIN.isDemoAccount ||
      permissions.length !== expectedPermissions.length ||
      permissions.some((permission, index) => permission !== expectedPermissions[index])) {
    throw new Error('The existing admin account did not match the expected AdminUser identity; no PDO accounts were provisioned.');
  }
}

export type ProvisioningEnvironment = Record<string, string | undefined>;

export type ProvisioningTarget = {
  host: string;
  database: string;
  isLocal: boolean;
};

/** Validates the configured target without ever including the URI in errors. */
export function validateProvisioningTarget(
  uri: string,
  args: string[] = [],
  environment: ProvisioningEnvironment = process.env
): ProvisioningTarget {
  const unsupportedArgs = args.filter((argument) => argument !== '--allow-nonlocal');
  if (unsupportedArgs.length) throw new Error('Unsupported provisioning command-line argument.');

  if (environment.NODE_ENV === 'production') {
    throw new Error('Demo-account provisioning is disabled when NODE_ENV is production.');
  }

  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('The configured MongoDB target is not a valid MongoDB URI.');
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('The configured MongoDB target must use mongodb:// or mongodb+srv://.');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const database = parsed.pathname.slice(1).split('/')[0];
  if (!host || database !== EXPECTED_DATABASE) {
    throw new Error(`Provisioning requires the ${EXPECTED_DATABASE} database and a named MongoDB host.`);
  }

  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (isLocal) {
    if (args.includes('--allow-nonlocal')) {
      throw new Error('Do not use --allow-nonlocal with a local MongoDB target.');
    }
    return { host, database, isLocal: true };
  }

  // A remote target needs four independent confirmations: non-production
  // process mode, an explicit CLI flag, an opt-in phrase, and exact host/DB
  // confirmations. No URI or credentials are printed.
  if (!args.includes('--allow-nonlocal') ||
      environment.RDMT_ACCOUNT_SEED_ALLOW_NONLOCAL !== NONLOCAL_CONFIRMATION ||
      environment.RDMT_ACCOUNT_SEED_EXPECTED_HOST?.toLowerCase() !== host ||
      environment.RDMT_ACCOUNT_SEED_EXPECTED_DATABASE !== EXPECTED_DATABASE) {
    throw new Error(
      'Refusing non-local MongoDB target. Remote provisioning requires --allow-nonlocal, ' +
      'RDMT_ACCOUNT_SEED_ALLOW_NONLOCAL, RDMT_ACCOUNT_SEED_EXPECTED_HOST, and ' +
      'RDMT_ACCOUNT_SEED_EXPECTED_DATABASE=rdmt to match the configured target.'
    );
  }

  return { host, database, isLocal: false };
}

export type PlannedAccount = ProvisioningAccount & {
  panchayatId?: unknown;
  password: string;
};

/** Pure preflight planner; no database writes occur until this returns. */
export function buildProvisioningPlan(input: {
  panchayats: Array<{ _id: unknown; name: string }>;
  existingUsers: Array<{ username?: string; email?: string }>;
  environment: ProvisioningEnvironment;
}): PlannedAccount[] {
  const errors: string[] = [];
  const panchayatByName = new Map<string, Array<{ _id: unknown; name: string }>>();
  for (const panchayat of input.panchayats) {
    const entries = panchayatByName.get(panchayat.name) || [];
    entries.push(panchayat);
    panchayatByName.set(panchayat.name, entries);
  }

  for (const account of DEMO_ACCOUNTS.filter((item) => item.panchayatName)) {
    const count = panchayatByName.get(account.panchayatName!)?.length || 0;
    if (count !== 1) errors.push(`Panchayat '${account.panchayatName}' matched ${count} records; exactly one is required.`);
  }

  const requestedUsernames = new Set(DEMO_ACCOUNTS.map((item) => item.username.toLowerCase()));
  const requestedEmails = new Set(DEMO_ACCOUNTS.map((item) => item.email.toLowerCase()));
  for (const existing of input.existingUsers) {
    const username = existing.username?.toLowerCase();
    const email = existing.email?.toLowerCase();
    if (username && requestedUsernames.has(username)) errors.push(`Username '${existing.username}' already exists.`);
    if (email && requestedEmails.has(email)) errors.push(`Email '${existing.email}' already exists.`);
  }

  for (const account of DEMO_ACCOUNTS) {
    if (!input.environment[account.passwordEnv]) {
      errors.push(`Required password environment variable '${account.passwordEnv}' is missing.`);
    }
  }

  if (errors.length) throw new Error(`Provisioning preflight failed:\n- ${errors.join('\n- ')}`);

  return DEMO_ACCOUNTS.map((account) => ({
    ...account,
    ...(account.panchayatName
      ? { panchayatId: panchayatByName.get(account.panchayatName)![0]._id }
      : {}),
    password: input.environment[account.passwordEnv]!
  }));
}

async function main(args: string[]): Promise<void> {
  const target = validateProvisioningTarget(env.MONGODB_URI, args);
  console.log(`Provisioning target approved: ${target.host}/${target.database} (${target.isLocal ? 'local' : 'explicitly confirmed non-local'}).`);

  // Connect directly; never use connectDb(), whose development fallback starts
  // an in-memory server and could make a provisioning run appear successful.
  await mongoose.connect(env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 10000 });
  try {
    if (mongoose.connection.name !== EXPECTED_DATABASE) {
      throw new Error(`Connected database was not ${EXPECTED_DATABASE}; no accounts were provisioned.`);
    }

    const panchayatNames = DEMO_ACCOUNTS.flatMap((account) => account.panchayatName ? [account.panchayatName] : []);
    const panchayats = await Panchayat.find({ name: { $in: panchayatNames } }).select('_id name').lean();
    const usernameExpressions = DEMO_ACCOUNTS.map((account) => new RegExp(`^${escapeRegExp(account.username)}$`, 'i'));
    const emailExpressions = DEMO_ACCOUNTS.map((account) => new RegExp(`^${escapeRegExp(account.email)}$`, 'i'));
    const existingUsers = await User.find({
      $or: [
        ...usernameExpressions.map((username) => ({ username })),
        ...emailExpressions.map((email) => ({ email }))
      ]
    }).select('username email').lean();

    const varthur = panchayats.filter((panchayat) => panchayat.name === EXPECTED_EXISTING_ADMIN.panchayatName);
    const existingAdminCandidates = await User.find({ username: /^admin$/i })
      .select('username email role panchayatId isDemoAccount permissions')
      .exec();
    const existingAdmin = existingAdminCandidates.length === 1 ? existingAdminCandidates[0] : null;
    const isAdminUserDiscriminator = existingAdmin
      ? Boolean(await AdminUser.exists({ _id: existingAdmin._id }))
      : false;
    if (existingAdminCandidates.length !== 1 || varthur.length !== 1) {
      throw new Error('The expected existing admin or canonical Varthur Panchayat was not uniquely found; no PDO accounts were provisioned.');
    }
    assertKnownExistingAdmin(existingAdmin, varthur[0]._id, isAdminUserDiscriminator);

    // This function validates every target Panchayat, PDO username/email, and
    // required password before the first account write.
    const plan = buildProvisioningPlan({ panchayats, existingUsers, environment: process.env });
    console.log('Preflight passed: existing admin identity verified; six Panchayats matched exactly once; all six PDO usernames/emails are unused.');
    const prepared = await Promise.all(plan.map(async (account) => ({
      account,
      passwordHash: await bcrypt.hash(account.password, PASSWORD_COST)
    })));

    const createdUsernames: string[] = [];
    try {
      for (const { account, passwordHash } of prepared) {
        const data = {
          name: account.name,
          username: account.username,
          email: account.email,
          passwordHash,
          role: account.role,
          isActive: true,
          isDemoAccount: true,
          ...(account.panchayatId ? { panchayatId: new mongoose.Types.ObjectId(String(account.panchayatId)) } : {})
        };

        await PdoUser.create({ ...data, designation: 'PDO' });
        createdUsernames.push(account.username);
      }
    } catch (error: any) {
      console.error(`Provisioning stopped after creating ${createdUsernames.length} account(s). No existing account was updated. Created usernames: ${createdUsernames.join(', ') || '(none)'}.`);
      console.error(`Database/model error code: ${error?.code || error?.name || 'unknown'}. No password or URI was logged.`);
      throw new Error('Account creation did not complete; inspect the created-user list before retrying.');
    }

    console.log(`Created ${createdUsernames.length} demo account(s): ${createdUsernames.join(', ')}.`);
    console.log('Passwords were hashed with bcrypt cost 10. Plaintext passwords were not logged.');
  } finally {
    await mongoose.disconnect();
  }
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  void main(process.argv.slice(2)).catch((error) => {
    // Only known preflight messages are safe to print; raw database errors may
    // contain connection information, so they are intentionally suppressed.
    if (String(error?.message || '').startsWith('Provisioning preflight failed:') ||
        String(error?.message || '').startsWith('Refusing') ||
        String(error?.message || '').startsWith('The configured') ||
        String(error?.message || '').startsWith('Provisioning requires') ||
        String(error?.message || '').startsWith('Demo-account')) {
      console.error(error.message);
    } else {
      console.error('Provisioning failed. Database details and credentials were not logged.');
    }
    process.exitCode = 1;
  });
}
