import { connectDb, disconnectDb } from '../config/db.js';
import { runSeed } from './seed.js';

async function main() {
  await connectDb();
  await runSeed({ forceDemo: true });
  await disconnectDb();
  process.exit(0);
}

main().catch(err => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
