import multer from 'multer';
import { HttpError } from '../errors.js';

export function notFound(_req, _res, next) {
  next(new HttpError(404, 'NOT_FOUND', 'Route not found'));
}

export function errorHandler(error, req, res, _next) {
  if (res.headersSent) return res.destroy(error);

  let status = error.status || 500;
  let code = error.code || 'INTERNAL_ERROR';
  let message = status >= 500 ? 'An unexpected server error occurred' : error.message;

  if (error instanceof multer.MulterError) {
    status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD';
    message = error.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the configured size limit' : 'Upload must contain exactly one file in the "file" field';
  } else if (error.code === 'ENOSPC') {
    status = 507;
    code = 'STORAGE_FULL';
    message = 'File storage is full';
  } else if (error.code === 'EACCES' || error.code === 'EROFS') {
    status = 503;
    code = 'STORAGE_UNAVAILABLE';
    message = 'File storage is not writable';
  } else if (error.code === 'EEXIST') {
    status = 409;
    code = 'UPLOAD_TICKET_USED';
    message = 'This upload ticket has already been used';
  }

  if (status >= 500) console.error({ requestId: req.id, error });
  res.status(status).json({
    error: { code, message, requestId: req.id },
  });
}
