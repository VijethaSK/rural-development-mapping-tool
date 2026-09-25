import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import app from './app.js';
import { runSeed } from './seed/seed.js';

async function start() {
  try {
    await connectDb();
    await runSeed();
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Backend startup aborted because database initialization failed.', err);
      process.exitCode = 1;
      return;
    }
    console.error('Database unavailable, starting in fallback mode.');
  }
  app.listen(env.PORT, () => {
    console.log(`Backend listening on http://localhost:${env.PORT}`);
  });
}

start();
