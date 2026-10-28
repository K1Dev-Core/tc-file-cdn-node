import 'dotenv/config';
import { createApp } from './src/app.js';
import { config } from './src/config.js';

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`TC File CDN listening on port ${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing HTTP server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
