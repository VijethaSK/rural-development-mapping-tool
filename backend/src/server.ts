import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import app from './app.js';
import { runSeed } from './seed/seed.js';

async function start() {
  try {
    await connectDb();
    await runSeed();
  } catch (err) {
    console.error('Database unavailable, starting in fallback mode.');
  }
  app.listen(env.PORT, () => {
    console.log(`Backend listening on http://localhost:${env.PORT}`);
  });
}

start();
