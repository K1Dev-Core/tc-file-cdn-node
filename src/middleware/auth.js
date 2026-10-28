import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

function secretMatches(supplied) {
  if (!config.apiKey) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(config.apiKey);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function requireApiKey(req, _res, next) {
  if (!config.apiKey) return next(new HttpError(503, 'UPLOADS_NOT_CONFIGURED', 'File uploads are not configured'));
  const authorization = req.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!secretMatches(supplied)) return next(new HttpError(401, 'UNAUTHORIZED', 'A valid bearer API key is required'));
  next();
}

function verifyUploadTicket(token) {
  if (!config.apiKey) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', config.apiKey).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (claims.scope !== 'file:upload' || !uuid.test(claims.id) || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!Number.isInteger(claims.maxBytes) || claims.maxBytes < 1 || claims.maxBytes > config.maxFileSizeBytes) return null;
    return claims;
  } catch { return null; }
}

export function authorizeUpload(req, _res, next) {
  if (!config.apiKey) return next(new HttpError(503, 'UPLOADS_NOT_CONFIGURED', 'File uploads are not configured'));
  const authorization = req.get('authorization') || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (secretMatches(supplied)) { req.uploadTicket = null; return next(); }
  const ticket = verifyUploadTicket(supplied);
  if (!ticket) return next(new HttpError(401, 'UNAUTHORIZED', 'A valid upload ticket is required'));
  req.uploadTicket = ticket;
  next();
}
