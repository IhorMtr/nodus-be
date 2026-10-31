import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../database/client.js';
import { announcementRepository } from '../modules/announcements/announcement.repository.js';
import { publishAnnouncementJob } from '../modules/announcements/announcement.publisher.js';
import {
  announcementQueue,
  enqueueAnnouncement,
  type PublishAnnouncementJob,
} from '../queues/announcement.queue.js';
import { QUEUE_NAMES } from '../queues/queue-names.js';
import { closeRedis } from '../redis/client.js';

// ==================== CONNECTIONS AND PROCESSING ====================

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', error =>
  logger.error({ err: error }, 'Announcement worker Redis error')
);

const worker = new Worker<PublishAnnouncementJob>(
  QUEUE_NAMES.announcements,
  async job => {
    if (job.name !== 'publish')
      throw new Error(`Unknown announcement job: ${job.name}`);
    await publishAnnouncementJob(job.data);
  },
  { connection }
);

worker.on('failed', (job, error) =>
  logger.error(
    { err: error, jobId: job?.id },
    'Announcement publication job failed'
  )
);
worker.on('error', error =>
  logger.error({ err: error }, 'Announcement worker error')
);

// ==================== RECONCILIATION ====================

async function reconcile() {
  for (const announcement of await announcementRepository.pending()) {
    if (announcement.publishAt)
      await enqueueAnnouncement(
        announcement.id,
        announcement.scheduleVersion,
        announcement.publishAt
      );
  }
}

// ==================== LIFECYCLE ====================

let stopping = false;
let reconciling = false;
let timer: NodeJS.Timeout | undefined;

async function runReconciliation() {
  if (stopping || reconciling) return;
  reconciling = true;
  try {
    await reconcile();
  } catch (error) {
    logger.error({ err: error }, 'Announcement queue reconciliation failed');
  } finally {
    reconciling = false;
  }
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  await worker.close();
  await announcementQueue.close();
  await connection.quit();
  await closeRedis();
  await prisma.$disconnect();
}

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

async function start() {
  await prisma.$connect();
  await runReconciliation();
  timer = setInterval(() => {
    void runReconciliation();
  }, 30_000);
  logger.info('Announcement worker started');
}

void start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Announcement worker startup failed');
  void shutdown().finally(() => {
    process.exitCode = 1;
  });
});
