import assert from 'node:assert/strict';
import {
  assertKnownExistingAdmin,
  buildProvisioningPlan,
  DEMO_ACCOUNTS,
  validateProvisioningTarget
} from './seed/provisionDemoAccounts.js';

const passwordEnvironment = Object.fromEntries(
  DEMO_ACCOUNTS.map((account, index) => [account.passwordEnv, `test-password-${index}`])
);
const panchayats = [
  { _id: 'adyar-id', name: 'Adyar' },
  { _id: 'harekala-id', name: 'Harekala' },
  { _id: 'neermarga-id', name: 'Neermarga' },
  { _id: 'pavuru-id', name: 'Pavuru' },
  { _id: 'pudu-id', name: 'Pudu' },
  { _id: 'varthur-id', name: 'Varthur Gram Panchayat' }
];

assert.deepEqual(
  validateProvisioningTarget('mongodb://127.0.0.1:27017/rdmt'),
  { host: '127.0.0.1', database: 'rdmt', isLocal: true },
  'local RDMT target is accepted without remote override'
);
assert.throws(
  () => validateProvisioningTarget('mongodb+srv://cluster.example/rdmt'),
  /Refusing non-local MongoDB target/,
  'Atlas/non-local target is refused by default'
);
assert.throws(
  () => validateProvisioningTarget('mongodb://localhost:27017/other'),
  /requires the rdmt database/,
  'a local database other than rdmt is refused'
);
assert.throws(
  () => validateProvisioningTarget('not-a-mongodb-uri'),
  /not a valid MongoDB URI/,
  'malformed database targets are rejected without exposing their contents'
);
assert.throws(
  () => validateProvisioningTarget('mongodb://localhost:27017/rdmt', ['--force']),
  /Unsupported provisioning command-line argument/,
  'unknown CLI flags are rejected'
);
assert.throws(
  () => validateProvisioningTarget('mongodb://127.0.0.1:27017/rdmt', [], { NODE_ENV: 'production' }),
  /disabled when NODE_ENV is production/,
  'production mode is refused even for a local URI'
);
assert.throws(
  () => validateProvisioningTarget('mongodb+srv://cluster.example/rdmt', ['--allow-nonlocal'], {
    RDMT_ACCOUNT_SEED_ALLOW_NONLOCAL: 'I_UNDERSTAND_THIS_CREATES_DEMO_ACCOUNTS',
    RDMT_ACCOUNT_SEED_EXPECTED_HOST: 'other.example',
    RDMT_ACCOUNT_SEED_EXPECTED_DATABASE: 'rdmt'
  }),
  /Refusing non-local MongoDB target/,
  'remote target confirmation must match the configured hostname exactly'
);
assert.deepEqual(
  validateProvisioningTarget('mongodb+srv://cluster.example/rdmt', ['--allow-nonlocal'], {
    RDMT_ACCOUNT_SEED_ALLOW_NONLOCAL: 'I_UNDERSTAND_THIS_CREATES_DEMO_ACCOUNTS',
    RDMT_ACCOUNT_SEED_EXPECTED_HOST: 'cluster.example',
    RDMT_ACCOUNT_SEED_EXPECTED_DATABASE: 'rdmt'
  }),
  { host: 'cluster.example', database: 'rdmt', isLocal: false },
  'remote target requires all explicit confirmations'
);

const plan = buildProvisioningPlan({
  panchayats,
  existingUsers: [],
  environment: passwordEnvironment
});
assert.equal(plan.length, 6, 'the provisioning plan creates PDOs only');
assert.deepEqual(
  plan.map((account) => [account.username, String(account.panchayatId)]),
  [
    ['pdo.adyar', 'adyar-id'],
    ['pdo.harekala', 'harekala-id'],
    ['pdo.neermarga', 'neermarga-id'],
    ['pdo.pavuru', 'pavuru-id'],
    ['pdo.pudu', 'pudu-id'],
    ['pdo.varthur', 'varthur-id']
  ],
  'each PDO is assigned the exact matching Panchayat record'
);

const expectedExistingAdmin = {
  username: 'admin',
  email: 'admin@varthur.gov.in',
  role: 'admin',
  panchayatId: 'varthur-id',
  isDemoAccount: false,
  permissions: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
};
assert.doesNotThrow(
  () => assertKnownExistingAdmin(expectedExistingAdmin, 'varthur-id', true),
  'the known existing AdminUser is accepted for skip-only handling'
);
assert.throws(
  () => assertKnownExistingAdmin({ ...expectedExistingAdmin, role: 'pdo' }, 'varthur-id', true),
  /did not match the expected AdminUser identity/,
  'an unexpected existing account named admin blocks provisioning'
);
assert.throws(
  () => assertKnownExistingAdmin(expectedExistingAdmin, 'varthur-id', false),
  /did not match the expected AdminUser identity/,
  'an admin-role base user without the AdminUser discriminator blocks provisioning'
);

assert.throws(
  () => buildProvisioningPlan({ panchayats: panchayats.slice(0, 5), existingUsers: [], environment: passwordEnvironment }),
  /Panchayat 'Varthur Gram Panchayat' matched 0 records/,
  'missing exact Panchayat match blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats: [...panchayats, { _id: 'duplicate', name: 'Adyar' }], existingUsers: [], environment: passwordEnvironment }),
  /Panchayat 'Adyar' matched 2 records/,
  'ambiguous Panchayat match blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [{ username: 'PDO.ADYAR' }], environment: passwordEnvironment }),
  /Username 'PDO.ADYAR' already exists/,
  'case-insensitive username conflict blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [{ email: 'PDO.PUDU@RDMT.INVALID' }], environment: passwordEnvironment }),
  /Email 'PDO.PUDU@RDMT.INVALID' already exists/,
  'case-insensitive email conflict blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [], environment: {} }),
  /Required password environment variable/,
  'missing password inputs block the complete plan before writes'
);

console.log('PASS: demo account provisioning target guard and complete preflight tests.');
