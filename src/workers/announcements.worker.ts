import { logger } from '../config/logger.js';
import { prisma } from '../database/client.js';
import { announcementQueue } from '../queues/announcement.queue.js';
import { closeRedis } from '../redis/client.js';
import { closeStep } from '../shared/utils/shutdown.js';
import { announcementWorker } from './announcements.lifecycle.js';

// ==================== SHUTDOWN ====================

let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ reason }, 'Shutting down announcement worker');

  const results = [
    await closeStep('announcement worker', () => announcementWorker.close()),
    await closeStep('announcement queue', () => announcementQueue.close()),
    ...(await Promise.all([
      closeStep('database', () => prisma.$disconnect()),
      closeStep('Redis', closeRedis),
    ])),
  ];
  process.exitCode = results.includes(false) ? 1 : exitCode;
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
  if (shuttingDown) {
    return;
  }
  await announcementWorker.start();
}

void bootstrap().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Announcement worker startup failed');
  void shutdown('Startup failure', 1);
});
