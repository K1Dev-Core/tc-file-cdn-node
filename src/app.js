import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { filesRouter } from './routes/files.js';
import { initializeStorage } from './storage.js';

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
  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TC File CDN API</title><style>body{margin:0;background:#f4f3fa;color:#343452;font:16px system-ui,sans-serif}.card{max-width:720px;margin:8vh auto;padding:32px;background:#fff;border:1px solid #dedced}h1{margin:0 0 8px;font-size:28px}.ok{color:#287a59;font-weight:700}p,li{line-height:1.7;color:#62617f}code{padding:2px 5px;background:#f0eff8}a{color:#59578f}</style><main class="card"><p class="ok">● API is online</p><h1>TC File CDN</h1><p>บริการอัปโหลดและดาวน์โหลดไฟล์</p><ul><li><code>GET /healthz</code> ตรวจสถานะพื้นที่จัดเก็บ</li><li><code>POST /v1/files</code> อัปโหลดไฟล์ (multipart field: <code>file</code>)</li><li><code>GET /v1/files/:id</code> ดูข้อมูลไฟล์</li><li><code>GET /v1/files/:id/download</code> ดาวน์โหลดไฟล์</li><li><code>DELETE /v1/files/:id</code> ลบไฟล์</li></ul><p>เส้นทางอัปโหลดและลบต้องส่ง <code>Authorization: Bearer API_KEY</code></p><p>เปิด <a href="/healthz">/healthz</a> เพื่อเช็ก storage</p></main></html>`);
  });
  app.get('/healthz', async (_req, res, next) => {
    try { await initializeStorage(); res.json({ status: 'ok' }); }
    catch (error) { next(error); }
  });
  app.use('/v1/files', express.json({ limit: '16kb' }), filesRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
