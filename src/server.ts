import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/client.js';
import { presenceService } from './modules/presence/presence.service.js';
import { announcementQueue } from './queues/announcement.queue.js';
import { closeRedis, redis } from './redis/client.js';
import { closeStep } from './shared/utils/shutdown.js';
import { initializeSocket } from './socket/index.js';
import { notificationBridge } from './socket/notification.bridge.js';
import { announcementWorker } from './workers/announcements.lifecycle.js';

// ==================== SERVER ====================

const httpServer = createServer(app);
const io = initializeSocket(httpServer);
let shuttingDown = false;

// ==================== SHUTDOWN ====================

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down');

  const deadline = setTimeout(() => {
    logger.fatal('Graceful shutdown timed out');
    httpServer.closeAllConnections();
    redis.disconnect();
    process.exit(1);
  }, 10_000);

  const results = [
    await closeStep('HTTP / Socket.IO', () => io.close()),
    await closeStep('presence', () => presenceService.close()),
    await closeStep('announcement worker', () => announcementWorker.close()),
    await closeStep('announcement queue', () => announcementQueue.close()),
    ...(await Promise.all([
      closeStep('database', () => prisma.$disconnect()),
      closeStep('Redis', closeRedis),
      closeStep('realtime bridge', () => notificationBridge.close()),
    ])),
  ];
  if (results.includes(false)) {
    exitCode = 1;
  }

  clearTimeout(deadline);
  logger.info({ exitCode }, 'Shutdown complete');
  process.exitCode = exitCode;
}

// ==================== BOOTSTRAP ====================

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

httpServer.on('error', error => {
  logger.error({ err: error }, 'HTTP server error');
  void shutdown('HTTP server error', 1);
});

async function bootstrap(): Promise<void> {
  await Promise.all([prisma.$connect(), announcementQueue.waitUntilReady()]);
  try {
    await notificationBridge.start();
  } catch (error) {
    logger.error({ err: error }, 'Realtime subscription unavailable');
  }
  await presenceService.start();
  if (shuttingDown) {
    return;
  }

  httpServer.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, environment: env.NODE_ENV },
      'Nodus backend started'
    );
    void announcementWorker.start().catch((error: unknown) => {
      logger.error({ err: error }, 'Failed to start announcement worker');
      void shutdown('Announcement worker startup failure', 1);
    });
  });
}

void bootstrap().catch((error: unknown) => {
  logger.error({ err: error }, 'Failed to start Nodus backend');
  void shutdown('Startup failure', 1);
});
