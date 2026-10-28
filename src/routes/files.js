import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { requireApiKey } from '../middleware/auth.js';
import { deleteFile, getFileInfo, initializeStorage, openFile, saveFile } from '../storage.js';

const router = express.Router();
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, callback) => {
      try {
        const dir = path.join(os.tmpdir(), 'tc-file-cdn');
        await mkdir(dir, { recursive: true });
        callback(null, dir);
      } catch (error) { callback(error); }
    },
    filename: (_req, _file, callback) => callback(null, randomUUID()),
  }),
  limits: { fileSize: config.maxFileSizeBytes, files: 1, fields: 8, parts: 10 },
});

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = (id) => { if (!idPattern.test(id)) throw new HttpError(400, 'INVALID_FILE_ID', 'File id must be a UUID'); };
const downloadUrl = (id) => `${config.baseUrl}/v1/files/${id}/download`;

router.post('/', requireApiKey, upload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'FILE_REQUIRED', 'Select one file using the "file" field');
  await initializeStorage();
  const id = randomUUID();
  let metadata;
  try {
    metadata = await saveFile({
      id,
      tempPath: req.file.path,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } finally {
    await rm(req.file.path, { force: true });
  }
  res.status(201).json({ data: { ...metadata, url: downloadUrl(id), downloadUrl: downloadUrl(id), infoUrl: `${config.baseUrl}/v1/files/${id}` } });
}));

router.get('/:id', asyncRoute(async (req, res) => {
  validId(req.params.id);
  const info = await getFileInfo(req.params.id);
  res.json({ data: { ...info, url: downloadUrl(info.id), downloadUrl: downloadUrl(info.id) } });
}));

router.get('/:id/download', asyncRoute(async (req, res, next) => {
  validId(req.params.id);
  let info;
  try { info = await getFileInfo(req.params.id); }
  catch (error) { return next(error); }

  const range = req.get('range');
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || info.size === 0) return res.status(416).set('Content-Range', `bytes */${info.size}`).json({ error: { code: 'INVALID_RANGE', message: 'Requested byte range is not satisfiable', requestId: req.id } });
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!suffix) return res.status(416).set('Content-Range', `bytes */${info.size}`).json({ error: { code: 'INVALID_RANGE', message: 'Requested byte range is not satisfiable', requestId: req.id } });
      start = Math.max(0, info.size - suffix);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
    }
    if (start >= info.size || end < start) return res.status(416).set('Content-Range', `bytes */${info.size}`).json({ error: { code: 'INVALID_RANGE', message: 'Requested byte range is not satisfiable', requestId: req.id } });
    end = Math.min(end, info.size - 1);
    status = 206;
  }

  const safeFallback = info.filename.replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7E]/g, '_').slice(0, 120) || 'download';
  res.status(status);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(Math.max(0, end - start + 1)),
    'Content-Disposition': `attachment; filename="${safeFallback}"; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600',
    ETag: `"${info.id}-${info.size}"`,
  });
  if (status === 206) res.set('Content-Range', `bytes ${start}-${end}/${info.size}`);

  if (info.size === 0) return res.end();
  try { await pipeline(openFile(info.id, start, end), res); }
  catch (error) { if (!res.headersSent) next(error); else res.destroy(error); }
}));

router.delete('/:id', requireApiKey, asyncRoute(async (req, res) => {
  validId(req.params.id);
  const file = await deleteFile(req.params.id);
  res.json({ data: { id: file.id, deleted: true } });
}));

export { router as filesRouter };
