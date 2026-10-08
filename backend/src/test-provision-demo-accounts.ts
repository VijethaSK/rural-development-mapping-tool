import assert from 'node:assert/strict';
import {
  assertKnownExistingAdmin,
  buildAccountCreateDocument,
  buildProvisioningPlan,
  DEMO_ACCOUNTS,
  formatProvisioningFailureDiagnostics,
  validateProvisioningTarget
} from './seed/provisionDemoAccounts.js';

const passwordEnvironment = Object.fromEntries(
  DEMO_ACCOUNTS.map((account, index) => [account.passwordEnv, `test-password-${index}`])
);
const panchayats = [
  { _id: '000000000000000000000001', name: 'Adyar' },
  { _id: '000000000000000000000002', name: 'Harekala' },
  { _id: '000000000000000000000003', name: 'Neermarga' },
  { _id: '000000000000000000000004', name: 'Pavuru' },
  { _id: '000000000000000000000005', name: 'Pudu' },
  { _id: '000000000000000000000006', name: 'Varthur Gram Panchayat' }
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
const safeDiagnostics = formatProvisioningFailureDiagnostics({
  name: 'MongooseServerSelectionError',
  code: 'ETIMEDOUT',
  codeName: 'MongoNetworkTimeoutError',
  message: 'mongodb+srv://db-user:super-secret@cluster.example/rdmt?retryWrites=true',
  stack: 'stack must never be emitted'
} as any);
assert.deepEqual(safeDiagnostics, [
  'Provisioning failed.',
  'Error name: MongooseServerSelectionError',
  'Database/model error code: ETIMEDOUT',
  'Database/model error name: MongoNetworkTimeoutError',
  'Safe message: (suppressed)'
]);
assert.ok(!safeDiagnostics.join('\n').includes('super-secret'));
assert.ok(!safeDiagnostics.join('\n').includes('db-user'));
assert.ok(!safeDiagnostics.join('\n').includes('cluster.example'));
assert.ok(!safeDiagnostics.join('\n').includes('stack must never be emitted'));
assert.deepEqual(
  formatProvisioningFailureDiagnostics({
    name: 'Error',
    message: 'Account creation did not complete; inspect the created-user list before retrying.'
  }).slice(-1)[0],
  'Safe message: Account creation did not complete; inspect the created-user list before retrying.'
);

const plan = buildProvisioningPlan({
  panchayats,
  existingUsers: [],
  environment: passwordEnvironment
});
assert.equal(plan.pdoAccountsToCreate.length, 6, 'all absent PDO accounts are planned for creation');
assert.equal(plan.adminAccountsToCreate.length, 6, 'all absent scoped Admin accounts are planned for creation');
assert.deepEqual(plan.existingPdoAccounts, []);
assert.deepEqual(plan.existingAdminAccounts, []);
assert.deepEqual(
  plan.pdoAccountsToCreate.map((account) => [account.username, String(account.panchayatId)]),
  [
    ['pdo.adyar', panchayats[0]._id],
    ['pdo.harekala', panchayats[1]._id],
    ['pdo.neermarga', panchayats[2]._id],
    ['pdo.pavuru', panchayats[3]._id],
    ['pdo.pudu', panchayats[4]._id],
    ['pdo.varthur', panchayats[5]._id]
  ],
  'each PDO is assigned the exact matching Panchayat record'
);
const adminPlan = plan.adminAccountsToCreate;
assert.deepEqual(
  adminPlan.map((account) => [account.username, account.email, String(account.panchayatId)]),
  [
    ['admin.adyar', 'admin.adyar@rdmt.invalid', panchayats[0]._id],
    ['admin.harekala', 'admin.harekala@rdmt.invalid', panchayats[1]._id],
    ['admin.neermarga', 'admin.neermarga@rdmt.invalid', panchayats[2]._id],
    ['admin.pavuru', 'admin.pavuru@rdmt.invalid', panchayats[3]._id],
    ['admin.pudu', 'admin.pudu@rdmt.invalid', panchayats[4]._id],
    ['admin.varthur', 'admin.varthur@rdmt.invalid', panchayats[5]._id]
  ],
  'each scoped Admin has the requested identity and exact Panchayat association'
);
const expectedPermissions = ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure'];
for (const account of adminPlan) {
  const document = buildAccountCreateDocument(account, 'bcrypt-hash-placeholder');
  assert.equal(document.role, 'admin');
  assert.equal(document.isActive, true);
  assert.equal(document.isDemoAccount, true);
  assert.equal(String(document.panchayatId), String(account.panchayatId));
  assert.ok('permissions' in document);
  assert.deepEqual(document.permissions, expectedPermissions);
  assert.equal(document.passwordHash, 'bcrypt-hash-placeholder');
  assert.equal('password' in document, false, 'plaintext password is absent from the account document');
}
for (const account of plan.pdoAccountsToCreate) {
  const document = buildAccountCreateDocument(account, 'bcrypt-hash-placeholder');
  assert.equal(document.role, 'pdo');
  assert.equal(document.designation, 'PDO');
  assert.equal(String(document.panchayatId), String(account.panchayatId));
}

const existingPdoUsers = DEMO_ACCOUNTS.filter((account) => account.role === 'pdo').map((account) => ({
  _id: account.username,
  username: account.username,
  email: account.email,
  role: 'pdo'
}));
const withExistingPdos = buildProvisioningPlan({
  panchayats,
  existingUsers: existingPdoUsers,
  environment: passwordEnvironment
});
assert.deepEqual(withExistingPdos.existingPdoAccounts, existingPdoUsers.map((user) => user.username));
assert.equal(withExistingPdos.pdoAccountsToCreate.length, 0);
assert.equal(withExistingPdos.adminAccountsToCreate.length, 6);
const noExistingPdoPassword = { ...passwordEnvironment };
delete noExistingPdoPassword.RDMT_DEMO_PDO_ADYAR_PASSWORD;
assert.doesNotThrow(() => buildProvisioningPlan({
  panchayats,
  existingUsers: existingPdoUsers,
  environment: noExistingPdoPassword
}), 'a preserved PDO does not require its password or get reset');

const withMissingPdo = buildProvisioningPlan({
  panchayats,
  existingUsers: existingPdoUsers.slice(1),
  environment: passwordEnvironment
});
assert.ok(withMissingPdo.pdoAccountsToCreate.some((account) => account.username === 'pdo.adyar'));
assert.equal(withMissingPdo.adminAccountsToCreate.length, 6);
assert.deepEqual(withMissingPdo.existingPdoAccounts, existingPdoUsers.slice(1).map((user) => user.username));

const oneExistingAdmin = {
  _id: 'admin.adyar-id',
  username: 'admin.adyar',
  email: 'admin.adyar@rdmt.invalid',
  role: 'admin',
  panchayatId: panchayats[0]._id,
  isDemoAccount: true,
  isActive: true,
  permissions: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
};
const withExistingAdmin = buildProvisioningPlan({
  panchayats,
  existingUsers: [oneExistingAdmin],
  environment: passwordEnvironment
});
assert.deepEqual(withExistingAdmin.existingAdminAccounts, ['admin.adyar']);
assert.ok(!withExistingAdmin.adminAccountsToCreate.some((account) => account.username === 'admin.adyar'));
assert.equal(withExistingAdmin.adminAccountsToCreate.length, 5);
const noExistingAdminPassword = { ...passwordEnvironment };
delete noExistingAdminPassword.RDMT_DEMO_ADMIN_ADYAR_PASSWORD;
assert.doesNotThrow(() => buildProvisioningPlan({
  panchayats,
  existingUsers: [oneExistingAdmin],
  environment: noExistingAdminPassword
}), 'a preserved exact Admin identity does not require its password');
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ ...oneExistingAdmin, panchayatId: panchayats[1]._id }],
    environment: passwordEnvironment
  }),
  /Scoped Admin 'admin.adyar' does not match its expected Panchayat/,
  'an existing scoped Admin assigned to the wrong Panchayat blocks the full plan'
);
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ ...oneExistingAdmin, isDemoAccount: false }],
    environment: passwordEnvironment
  }),
  /Scoped Admin 'admin.adyar' does not match its expected Panchayat/,
  'an existing scoped Admin without the demo flag blocks the full plan'
);
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ ...oneExistingAdmin, permissions: ['manage_users'] }],
    environment: passwordEnvironment
  }),
  /Scoped Admin 'admin.adyar' does not match its expected Panchayat/,
  'an existing scoped Admin with incomplete permissions blocks the full plan'
);
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ ...oneExistingAdmin, isActive: false }],
    environment: passwordEnvironment
  }),
  /Scoped Admin 'admin.adyar' does not match its expected Panchayat/,
  'an inactive existing scoped Admin blocks the full plan'
);

const expectedExistingAdmin = {
  username: 'admin',
  email: 'admin@varthur.gov.in',
  role: 'admin',
  panchayatId: panchayats[5]._id,
  isDemoAccount: false,
  permissions: ['manage_users', 'configure_weights', 'verify_work', 'manage_infrastructure']
};
assert.doesNotThrow(
  () => assertKnownExistingAdmin(expectedExistingAdmin, panchayats[5]._id, true),
  'the known existing AdminUser is accepted for skip-only handling'
);
assert.throws(
  () => assertKnownExistingAdmin({ ...expectedExistingAdmin, role: 'pdo' }, panchayats[5]._id, true),
  /did not match the expected AdminUser identity/,
  'an unexpected existing account named admin blocks provisioning'
);
assert.throws(
  () => assertKnownExistingAdmin(expectedExistingAdmin, panchayats[5]._id, false),
  /did not match the expected AdminUser identity/,
  'an admin-role base user without the AdminUser discriminator blocks provisioning'
);
for (const changedAdmin of [
  { ...expectedExistingAdmin, username: 'other' },
  { ...expectedExistingAdmin, email: 'other@example.invalid' },
  { ...expectedExistingAdmin, panchayatId: panchayats[0]._id },
  { ...expectedExistingAdmin, isDemoAccount: true },
  { ...expectedExistingAdmin, permissions: ['manage_users'] }
]) {
  assert.throws(
    () => assertKnownExistingAdmin(changedAdmin, panchayats[5]._id, true),
    /did not match the expected AdminUser identity/,
    'any change to the protected system-wide Admin identity blocks provisioning'
  );
}

assert.throws(
  () => buildProvisioningPlan({ panchayats: panchayats.slice(0, 5), existingUsers: [], environment: passwordEnvironment }),
  /Panchayat 'Varthur Gram Panchayat' matched 0 records/,
  'missing exact Panchayat match blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats: [...panchayats, { _id: '000000000000000000000007', name: 'Adyar' }], existingUsers: [], environment: passwordEnvironment }),
  /Panchayat 'Adyar' matched 2 records/,
  'ambiguous Panchayat match blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [{ username: 'ADMIN.ADYAR' }], environment: passwordEnvironment }),
  /Username 'admin.adyar' conflicts with an unexpected existing account identity/,
  'case-insensitive scoped Admin username conflict blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [{ email: 'ADMIN.PUDU@RDMT.INVALID' }], environment: passwordEnvironment }),
  /Email 'admin.pudu@rdmt.invalid' conflicts with an unexpected existing account identity/,
  'case-insensitive scoped Admin email conflict blocks the complete plan'
);
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ username: 'pdo.adyar', email: 'somebody@rdmt.invalid', role: 'pdo' }],
    environment: passwordEnvironment
  }),
  /Username 'pdo.adyar' conflicts with an unexpected existing account identity/,
  'existing PDO username with an unexpected email blocks provisioning'
);
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: [{ username: 'somebody', email: 'pdo.adyar@rdmt.invalid', role: 'pdo' }],
    environment: passwordEnvironment
  }),
  /Email 'pdo.adyar@rdmt.invalid' conflicts with an unexpected existing account identity/,
  'existing PDO email under an unexpected username blocks provisioning'
);
const missingAdminPasswordEnvironment = { ...passwordEnvironment };
delete missingAdminPasswordEnvironment.RDMT_DEMO_ADMIN_NEERMARGA_PASSWORD;
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [], environment: missingAdminPasswordEnvironment }),
  /Required password environment variable 'RDMT_DEMO_ADMIN_NEERMARGA_PASSWORD' is missing/,
  'a missing Admin password blocks the complete preflight before any account writes'
);
const missingAdminPasswordWithOtherAccountsPresent = { ...passwordEnvironment };
delete missingAdminPasswordWithOtherAccountsPresent.RDMT_DEMO_ADMIN_NEERMARGA_PASSWORD;
assert.throws(
  () => buildProvisioningPlan({
    panchayats,
    existingUsers: existingPdoUsers,
    environment: missingAdminPasswordWithOtherAccountsPresent
  }),
  /Required password environment variable 'RDMT_DEMO_ADMIN_NEERMARGA_PASSWORD' is missing/,
  'a missing password for a new Admin fails while expected PDOs are preserved, before writes'
);
assert.throws(
  () => buildProvisioningPlan({ panchayats, existingUsers: [], environment: {} }),
  /Required password environment variable/,
  'missing password inputs block the complete plan before writes'
);

console.log('PASS: demo account provisioning target guard and complete preflight tests.');
