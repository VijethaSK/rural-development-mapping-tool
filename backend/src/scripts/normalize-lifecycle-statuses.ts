import { connectDb, disconnectDb } from '../config/db.js';
import { normalizeLifecycleStatuses } from '../services/lifecycleStatusMigration.js';

try {
  await connectDb();
  const apply = process.argv.includes('--apply');
  const result = await normalizeLifecycleStatuses(apply);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result }, null, 2));
  if (result.unknown.length) process.exitCode = 2;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await disconnectDb();
}
