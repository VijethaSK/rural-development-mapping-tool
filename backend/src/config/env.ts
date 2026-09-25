import * as dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envFilePath });

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'backend/uploads';

export const env = { PORT, MONGODB_URI, JWT_SECRET, UPLOAD_DIR };

