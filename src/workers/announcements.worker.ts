import { logger } from '../config/logger.js';
import { prisma } from '../database/client.js';
import { announcementQueue } from '../queues/announcement.queue.js';
import { closeRedis } from '../redis/client.js';
import { announcementWorker } from './announcements.lifecycle.js';

// ==================== SHUTDOWN ====================

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down announcement worker');

  try {
    await announcementWorker.close();
  } catch (error) {
    logger.error({ err: error }, 'Failed to close announcement worker');
    exitCode = 1;
  }

  try {
    await announcementQueue.close();
  } catch (error) {
    logger.error({ err: error }, 'Failed to close announcement queue');
    exitCode = 1;
  }

  const infrastructure = await Promise.allSettled([
    prisma.$disconnect(),
    closeRedis(),
  ]);
  for (const result of infrastructure) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'Failed to close infrastructure');
      exitCode = 1;
    }
  }
  process.exitCode = exitCode;
}

// ==================== BOOTSTRAP ====================

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

async function bootstrap(): Promise<void> {
  await Promise.all([prisma.$connect(), announcementQueue.waitUntilReady()]);
  if (shuttingDown) return;
  await announcementWorker.start();
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Announcement worker startup failed');
  void shutdown('Startup failure', 1);
});
