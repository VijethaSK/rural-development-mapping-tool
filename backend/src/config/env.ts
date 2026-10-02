import * as dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoutingConfiguration } from './routing.js';

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
dotenv.config({ path: envFilePath });

const PORT = Number(process.env.PORT) || 4000;
const MONGODB_URI = process.env.MONGODB_URI ?? '';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret';
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? 'backend/uploads';
const routingConfiguration = parseRoutingConfiguration(
  process.env.ROUTING_PROVIDER,
  process.env.OSRM_BASE_URL
);

export const env = {
  PORT,
  MONGODB_URI,
  JWT_SECRET,
  UPLOAD_DIR,
  ROUTING_PROVIDER: routingConfiguration.providerSelection,
  OSRM_BASE_URL: routingConfiguration.osrmBaseUrl
};

