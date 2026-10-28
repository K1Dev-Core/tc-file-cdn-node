import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './errors.js';

const metadataPath = (id) => path.join(config.metadataDir, `${id}.json`);
const filePath = (id) => path.join(config.uploadDir, id);

export async function initializeStorage() {
  await Promise.all([mkdir(config.uploadDir, { recursive: true }), mkdir(config.metadataDir, { recursive: true })]);
}

export async function saveFile({ id, tempPath, originalName, mimeType, size }) {
  const metadata = {
    id,
    filename: originalName,
    mimeType: mimeType || 'application/octet-stream',
    size,
    uploadedAt: new Date().toISOString(),
  };
  await rename(tempPath, filePath(id));
  try {
    await writeFile(metadataPath(id), JSON.stringify(metadata), { flag: 'wx' });
  } catch (error) {
    await rm(filePath(id), { force: true });
    throw error;
  }
  return metadata;
}

export async function getFileInfo(id) {
  try {
    const [raw, details] = await Promise.all([readFile(metadataPath(id), 'utf8'), stat(filePath(id))]);
    return { ...JSON.parse(raw), size: details.size };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) throw new HttpError(404, 'FILE_NOT_FOUND', 'File not found');
    throw error;
  }
}

export function openFile(id, start, end) {
  return createReadStream(filePath(id), { start, end });
}

export async function deleteFile(id) {
  const info = await getFileInfo(id);
  await rm(filePath(id), { force: true });
  await rm(metadataPath(id), { force: true });
  return info;
}
