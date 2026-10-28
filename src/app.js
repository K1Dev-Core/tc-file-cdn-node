import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { filesRouter } from './routes/files.js';
import { initializeStorage } from './storage.js';

export const storageReady = initializeStorage();

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use((req, res, next) => {
    const incomingId = req.get('x-request-id') || '';
    req.id = /^[A-Za-z0-9._-]{1,100}$/.test(incomingId) ? incomingId : randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Range', 'X-Request-Id'],
    exposedHeaders: ['Accept-Ranges', 'Content-Length', 'Content-Range', 'Content-Disposition', 'ETag', 'X-Request-Id'],
    maxAge: 600,
  }));
  app.use(rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many requests; try again later', requestId: req.id } }),
  }));
  app.get('/healthz', async (_req, res, next) => {
    try { await storageReady; res.json({ status: 'ok' }); }
    catch (error) { next(error); }
  });
  app.use('/v1/files', express.json({ limit: '16kb' }), filesRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
