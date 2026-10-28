import { timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

export function requireApiKey(req, _res, next) {
  if (!config.apiKey) return next(new HttpError(503, 'UPLOADS_NOT_CONFIGURED', 'File uploads are not configured'));
  const authorization = req.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(config.apiKey);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return next(new HttpError(401, 'UNAUTHORIZED', 'A valid bearer API key is required'));
  }
  next();
}
