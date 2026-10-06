export interface BackendStartupOptions {
  connectDb: () => Promise<void>;
  listen: (port: number, callback: () => void) => unknown;
  port: number;
  production: boolean;
}

/** Starts the application after connecting to MongoDB. Seeding is never part of startup. */
export async function startBackend(options: BackendStartupOptions): Promise<void> {
  try {
    await options.connectDb();
  } catch (err) {
    if (options.production) {
      console.error('Backend startup aborted because database initialization failed.', err);
      process.exitCode = 1;
      return;
    }
    console.error('Database unavailable, starting in fallback mode.');
  }

  options.listen(options.port, () => {
    console.log(`Backend listening on http://localhost:${options.port}`);
  });
}
