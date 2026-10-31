import { Queue } from 'bullmq';
import { logger } from '../config/logger.js';
import { queueConnection } from './connection.js';
import { QUEUE_NAMES } from './queue-names.js';

// ==================== JOB TYPES AND QUEUE ====================

export type PublishAnnouncementJob = {
  announcementId: string;
  scheduleVersion: number;
};

export const announcementQueue = new Queue<PublishAnnouncementJob>(
  QUEUE_NAMES.announcements,
  {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  }
);

announcementQueue.on('error', error =>
  logger.error({ err: error }, 'Announcement queue error')
);

// ==================== SCHEDULING ====================

export function announcementJobId(id: string, version: number) {
  return `${id}-${version}`;
}

export async function enqueueAnnouncement(
  id: string,
  version: number,
  publishAt: Date
) {
  await announcementQueue.add(
    'publish',
    { announcementId: id, scheduleVersion: version },
    {
      jobId: announcementJobId(id, version),
      delay: Math.max(0, publishAt.getTime() - Date.now()),
    }
  );
}

export async function removeAnnouncementJob(id: string, version: number) {
  const job = await announcementQueue.getJob(announcementJobId(id, version));
  if (job) await job.remove();
}
