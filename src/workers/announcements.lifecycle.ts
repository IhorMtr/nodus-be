import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { announcementRepository } from '../modules/announcements/announcement.repository.js';
import { publishAnnouncementJob } from '../modules/announcements/announcement.publisher.js';
import {
  enqueueAnnouncement,
  type PublishAnnouncementJob,
} from '../queues/announcement.queue.js';
import { QUEUE_NAMES } from '../queues/queue-names.js';

// ==================== TYPES ====================

type WorkerState = {
  connection: Redis;
  worker: Worker<PublishAnnouncementJob>;
  timer: NodeJS.Timeout | undefined;
};

// ==================== WORKER LIFECYCLE ====================

class AnnouncementWorker {
  // ==================== STATE ====================

  #started: Promise<WorkerState> | undefined;
  #stopping = false;
  #closing: Promise<void> | undefined;
  #reconciliation: Promise<void> | undefined;

  // ==================== RECONCILIATION ====================

  async #reconcile(): Promise<void> {
    for (const announcement of await announcementRepository.pending()) {
      if (announcement.publishAt)
        await enqueueAnnouncement(
          announcement.id,
          announcement.scheduleVersion,
          announcement.publishAt
        );
    }
  }

  #runReconciliation(): Promise<void> {
    if (this.#stopping) return Promise.resolve();
    if (this.#reconciliation) return this.#reconciliation;
    this.#reconciliation = (async () => {
      try {
        await this.#reconcile();
      } catch (error) {
        logger.error(
          { err: error },
          'Announcement queue reconciliation failed'
        );
      } finally {
        this.#reconciliation = undefined;
      }
    })();
    return this.#reconciliation;
  }

  // ==================== INITIALIZATION ====================

  async #initialize(): Promise<WorkerState> {
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

    try {
      await worker.waitUntilReady();
      await this.#runReconciliation();
      const timer = this.#stopping
        ? undefined
        : setInterval(() => {
            void this.#runReconciliation();
          }, 30_000);
      logger.info('Announcement worker started');
      return { connection, worker, timer };
    } catch (error) {
      await worker.close();
      connection.disconnect();
      throw error;
    }
  }

  // ==================== LIFECYCLE ====================

  async start(): Promise<void> {
    if (this.#stopping) throw new Error('Announcement worker is shutting down');
    this.#started ??= this.#initialize();
    await this.#started;
  }

  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    this.#stopping = true;
    this.#closing = (async () => {
      if (!this.#started) return;
      let state: WorkerState;
      try {
        state = await this.#started;
      } catch {
        return;
      }
      if (state.timer) clearInterval(state.timer);
      if (this.#reconciliation) await this.#reconciliation;
      await state.worker.close();
      if (state.connection.status === 'ready') await state.connection.quit();
      else state.connection.disconnect();
      logger.info('Announcement worker stopped');
    })();
    return this.#closing;
  }
}

// ==================== PUBLIC API ====================

export const announcementWorker = new AnnouncementWorker();
