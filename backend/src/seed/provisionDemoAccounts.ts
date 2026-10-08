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
  permissions?: string[];
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
  },
  {
    username: 'admin.adyar',
    email: 'admin.adyar@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Adyar',
    panchayatName: 'Adyar',
    passwordEnv: 'RDMT_DEMO_ADMIN_ADYAR_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
  },
  {
    username: 'admin.harekala',
    email: 'admin.harekala@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Harekala',
    panchayatName: 'Harekala',
    passwordEnv: 'RDMT_DEMO_ADMIN_HAREKALA_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
  },
  {
    username: 'admin.neermarga',
    email: 'admin.neermarga@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Neermarga',
    panchayatName: 'Neermarga',
    passwordEnv: 'RDMT_DEMO_ADMIN_NEERMARGA_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
  },
  {
    username: 'admin.pavuru',
    email: 'admin.pavuru@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Pavuru',
    panchayatName: 'Pavuru',
    passwordEnv: 'RDMT_DEMO_ADMIN_PAVURU_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
  },
  {
    username: 'admin.pudu',
    email: 'admin.pudu@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Pudu',
    panchayatName: 'Pudu',
    passwordEnv: 'RDMT_DEMO_ADMIN_PUDU_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
  },
  {
    username: 'admin.varthur',
    email: 'admin.varthur@rdmt.invalid',
    role: 'admin',
    name: 'Admin - Varthur Gram Panchayat',
    panchayatName: 'Varthur Gram Panchayat',
    passwordEnv: 'RDMT_DEMO_ADMIN_VARTHUR_PASSWORD',
    permissions: [...EXPECTED_EXISTING_ADMIN.permissions]
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

const SAFE_PROVISIONING_MESSAGES = new Set([
  'Account creation did not complete; inspect the created-user list before retrying.',
  'The expected existing admin or canonical Varthur Panchayat was not uniquely found; no PDO accounts were provisioned.',
  'The existing admin account did not match the expected AdminUser identity; no PDO accounts were provisioned.',
  'Connected database was not rdmt; no accounts were provisioned.'
]);

function safeDiagnosticToken(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const token = String(value);
  return token.length > 0 && token.length <= 80 && /^[A-Za-z0-9_.-]+$/.test(token)
    ? token
    : undefined;
}

/** Format error classification without exposing stacks, URIs, or credentials. */
export function formatProvisioningFailureDiagnostics(error: {
  name?: unknown;
  code?: unknown;
  codeName?: unknown;
  message?: unknown;
} | null | undefined): string[] {
  const name = safeDiagnosticToken(error?.name) || '(unavailable)';
  const code = safeDiagnosticToken(error?.code);
  const databaseErrorName = safeDiagnosticToken(error?.codeName) || safeDiagnosticToken(error?.name);
  const message = typeof error?.message === 'string' && SAFE_PROVISIONING_MESSAGES.has(error.message)
    ? error.message
    : '(suppressed)';

  return [
    'Provisioning failed.',
    `Error name: ${name}`,
    ...(code ? [`Database/model error code: ${code}`] : []),
    ...(databaseErrorName ? [`Database/model error name: ${databaseErrorName}`] : []),
    `Safe message: ${message}`
  ];
}

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

export type ProvisioningPlan = {
  pdoAccountsToCreate: PlannedAccount[];
  adminAccountsToCreate: PlannedAccount[];
  existingPdoAccounts: string[];
  existingAdminAccounts: string[];
};

/** Pure preflight planner; no database writes occur until this returns. */
export function buildProvisioningPlan(input: {
  panchayats: Array<{ _id: unknown; name: string }>;
  existingUsers: Array<{
    _id?: unknown;
    username?: string;
    email?: string;
    role?: string;
    panchayatId?: unknown;
    isDemoAccount?: boolean;
    isActive?: boolean;
    permissions?: string[];
  }>;
  environment: ProvisioningEnvironment;
}): ProvisioningPlan {
  const errors: string[] = [];
  const missingAccounts: ProvisioningAccount[] = [];
  const existingPdoAccounts: string[] = [];
  const existingAdminAccounts: string[] = [];
  const panchayatByName = new Map<string, Array<{ _id: unknown; name: string }>>();
  for (const panchayat of input.panchayats) {
    const entries = panchayatByName.get(panchayat.name) || [];
    entries.push(panchayat);
    panchayatByName.set(panchayat.name, entries);
  }

  const requiredPanchayatNames = new Set(
    DEMO_ACCOUNTS.flatMap((account) => account.panchayatName ? [account.panchayatName] : [])
  );
  for (const name of requiredPanchayatNames) {
    const count = panchayatByName.get(name)?.length || 0;
    if (count !== 1) errors.push(`Panchayat '${name}' matched ${count} records; exactly one is required.`);
  }

  for (const account of DEMO_ACCOUNTS) {
    const usernameMatches = input.existingUsers.filter(
      (existing) => existing.username?.toLowerCase() === account.username.toLowerCase()
    );
    const emailMatches = input.existingUsers.filter(
      (existing) => existing.email?.toLowerCase() === account.email.toLowerCase()
    );

    if (!usernameMatches.length && !emailMatches.length) {
      missingAccounts.push(account);
      continue;
    }

    const sameExistingUser = usernameMatches.length === 1 && emailMatches.length === 1 && (
      usernameMatches[0] === emailMatches[0] ||
      (usernameMatches[0]._id != null && emailMatches[0]._id != null &&
        String(usernameMatches[0]._id) === String(emailMatches[0]._id))
    );
    if (!sameExistingUser || usernameMatches[0].role !== account.role) {
      if (usernameMatches.length || emailMatches.length) {
        if (usernameMatches.length) errors.push(`Username '${account.username}' conflicts with an unexpected existing account identity.`);
        if (emailMatches.length) errors.push(`Email '${account.email}' conflicts with an unexpected existing account identity.`);
      }
      continue;
    }

    if (account.role === 'pdo') {
      existingPdoAccounts.push(account.username);
    } else {
      const expectedPanchayatId = panchayatByName.get(account.panchayatName!)?.[0]._id;
      const actualPermissions = [...(usernameMatches[0].permissions || [])].sort();
      const expectedPermissions = [...(account.permissions || EXPECTED_EXISTING_ADMIN.permissions)].sort();
      const adminIdentityMatches =
        String(usernameMatches[0].panchayatId || '') === String(expectedPanchayatId || '') &&
        usernameMatches[0].isDemoAccount === true &&
        usernameMatches[0].isActive === true &&
        actualPermissions.length === expectedPermissions.length &&
        actualPermissions.every((permission, index) => permission === expectedPermissions[index]);
      if (!adminIdentityMatches) {
        errors.push(`Scoped Admin '${account.username}' does not match its expected Panchayat, active/demo flags, and permissions.`);
        continue;
      }
      existingAdminAccounts.push(account.username);
    }
  }

  for (const account of missingAccounts) {
    if (!input.environment[account.passwordEnv]) {
      errors.push(`Required password environment variable '${account.passwordEnv}' is missing.`);
    }
  }

  if (errors.length) throw new Error(`Provisioning preflight failed:\n- ${errors.join('\n- ')}`);

  const accountsToCreate = missingAccounts.map((account) => ({
      ...account,
      ...(account.panchayatName
        ? { panchayatId: panchayatByName.get(account.panchayatName)![0]._id }
        : {}),
      password: input.environment[account.passwordEnv]!
    }));
  return {
    pdoAccountsToCreate: accountsToCreate.filter((account) => account.role === 'pdo'),
    adminAccountsToCreate: accountsToCreate.filter((account) => account.role === 'admin'),
    existingPdoAccounts,
    existingAdminAccounts
  };
}

/** Build the role-specific model payload while keeping plaintext passwords out of it. */
export function buildAccountCreateDocument(account: PlannedAccount, passwordHash: string) {
  const data = {
    name: account.name,
    username: account.username,
    email: account.email,
    passwordHash,
    role: account.role,
    isActive: true,
    isDemoAccount: true,
    ...(account.panchayatId
      ? { panchayatId: new mongoose.Types.ObjectId(String(account.panchayatId)) }
      : {})
  };

  return account.role === 'admin'
    ? { ...data, role: 'admin' as const, permissions: account.permissions || [...EXPECTED_EXISTING_ADMIN.permissions] }
    : { ...data, role: 'pdo' as const, designation: 'PDO' as const };
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
    }).select('username email role panchayatId isDemoAccount isActive permissions').lean();

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

    // This function validates every target Panchayat, classifies each requested
    // identity, and checks passwords for all accounts that must be created.
    const plan = buildProvisioningPlan({ panchayats, existingUsers, environment: process.env });
    const describe = (accounts: string[]) => accounts.join(', ') || '(none)';
    console.log(`Existing PDO accounts preserved: ${describe(plan.existingPdoAccounts)}.`);
    console.log(`Existing scoped Admin accounts preserved: ${describe(plan.existingAdminAccounts)}.`);
    const accountsToCreate = [...plan.pdoAccountsToCreate, ...plan.adminAccountsToCreate];
    console.log(`Preflight passed: existing system-wide admin identity verified; six Panchayats matched exactly once; ${accountsToCreate.length} missing account(s) are ready to create.`);
    const prepared = await Promise.all(accountsToCreate.map(async (account) => ({
      account,
      passwordHash: await bcrypt.hash(account.password, PASSWORD_COST)
    })));

    const createdPdoUsernames: string[] = [];
    const createdAdminUsernames: string[] = [];
    try {
      for (const { account, passwordHash } of prepared) {
        if (account.role === 'admin') {
          await AdminUser.create(buildAccountCreateDocument(account, passwordHash));
          createdAdminUsernames.push(account.username);
        } else {
          await PdoUser.create(buildAccountCreateDocument(account, passwordHash));
          createdPdoUsernames.push(account.username);
        }
      }
    } catch (error: any) {
      console.error(`Provisioning stopped after creating PDO account(s): ${describe(createdPdoUsernames)}; scoped Admin account(s): ${describe(createdAdminUsernames)}. Existing accounts were not modified.`);
      console.error(`Database/model error code: ${safeDiagnosticToken(error?.code) || 'unknown'}.`);
      console.error(`Database/model error name: ${safeDiagnosticToken(error?.codeName) || safeDiagnosticToken(error?.name) || 'unknown'}.`);
      throw new Error('Account creation did not complete; inspect the created-user list before retrying.');
    }

    console.log(`Newly created PDO accounts: ${describe(createdPdoUsernames)}.`);
    console.log(`Newly created scoped Admin accounts: ${describe(createdAdminUsernames)}.`);
    console.log('Passwords were hashed with bcrypt cost 10. Plaintext passwords were not logged.');
  } finally {
    await mongoose.disconnect();
  }
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) {
  void main(process.argv.slice(2)).catch((error) => {
    for (const line of formatProvisioningFailureDiagnostics(error)) console.error(line);
    process.exitCode = 1;
  });
}
