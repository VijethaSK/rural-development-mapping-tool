import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import app from './app.js';
import { startBackend } from './startup.js';

void startBackend({
  connectDb,
  listen: (port, callback) => app.listen(port, callback),
  port: env.PORT,
  production: process.env.NODE_ENV === 'production'
});
