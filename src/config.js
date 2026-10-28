import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integer = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

export const config = Object.freeze({
  root,
  port: integer(process.env.PORT, 3002, 1, 65535),
  baseUrl: (process.env.BASE_URL || `http://localhost:${integer(process.env.PORT, 3002, 1, 65535)}`).replace(/\/$/, ''),
  apiKey: process.env.API_KEY || '',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  maxFileSizeBytes: integer(process.env.MAX_FILE_SIZE_MB, 250, 1, 10_240) * 1024 * 1024,
  rateLimitWindowMs: integer(process.env.RATE_LIMIT_WINDOW_MS, 60_000, 1_000, 3_600_000),
  rateLimitMax: integer(process.env.RATE_LIMIT_MAX, 60, 1, 100_000),
  uploadDir: path.join(root, 'public', 'uploads'),
  metadataDir: path.join(root, 'data'),
});
