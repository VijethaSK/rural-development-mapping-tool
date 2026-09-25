import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { env } from './env.js';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Keep isolated test database files in the OS temp directory by default, while
// allowing constrained environments to choose a writable location explicitly.
const testMongoTmp = process.env.RDMT_TEST_MONGO_TMP || path.join(os.tmpdir(), 'rdmt-mongo-test');
try {
  fs.mkdirSync(testMongoTmp, { recursive: true });
  process.env.TEMP = testMongoTmp;
  process.env.TMP = testMongoTmp;
  process.env.MONGOMS_DOWNLOAD_DIR = process.env.RDMT_MONGOMS_DOWNLOAD_DIR || path.join(testMongoTmp, 'binaries');
} catch {}

let memoryServer: MongoMemoryServer | null = null;

export async function connectDb(forceMemory = false): Promise<void> {
  const shouldUseMemory = forceMemory || process.env.USE_MEMORY_DB === 'true';
  const uri = !shouldUseMemory ? env.MONGODB_URI : '';

  if (uri) {
    try {
      await mongoose.connect(uri, { autoIndex: false });
      console.log(`Connected to MongoDB at ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
      return;
    } catch (err: any) {
      console.warn('Direct MongoDB connection failed. Falling back to MongoMemoryServer...', err?.message || err);
    }
  }

  try {
    if (!memoryServer) {
      memoryServer = await MongoMemoryServer.create();
    }
    const memUri = memoryServer.getUri();
    await mongoose.connect(memUri, { autoIndex: false });
    console.log(`Connected to in-memory MongoDB at ${memUri}`);
  } catch (err) {
    console.error('Failed to initialize MongoDB instance:', err);
    throw err;
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
