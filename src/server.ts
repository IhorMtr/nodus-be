import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/client.js';
import { closeRedis, redis } from './redis/client.js';
import { initializeSocket } from './socket/index.js';

// ==================== SERVER ====================

const httpServer = createServer(app);
const io = initializeSocket(httpServer);
let shuttingDown = false;

// ==================== SHUTDOWN ====================

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down');

  const deadline = setTimeout(() => {
    logger.fatal('Graceful shutdown timed out');
    httpServer.closeAllConnections();
    redis.disconnect();
    process.exit(1);
  }, 10_000);

  try {
    // Socket.IO closes its clients and the attached HTTP server, draining requests.
    await io.close();
  } catch (error) {
    logger.error({ err: error }, 'Failed to close HTTP / Socket.IO');
    exitCode = 1;
  }

  const results = await Promise.allSettled([prisma.$disconnect(), closeRedis()]);
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'Failed to close an infrastructure connection');
      exitCode = 1;
    }
  }

  clearTimeout(deadline);
  logger.info({ exitCode }, 'Shutdown complete');
  process.exitCode = exitCode;
}

// ==================== BOOTSTRAP ====================

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });

httpServer.on('error', (error) => {
  logger.error({ err: error }, 'HTTP server error');
  void shutdown('HTTP server error', 1);
});

async function bootstrap(): Promise<void> {
  await Promise.all([prisma.$connect(), redis.connect()]);
  if (shuttingDown) return;

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'Nodus backend started');
  });
}

void bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to start Nodus backend');
  void shutdown('Startup failure', 1);
});
