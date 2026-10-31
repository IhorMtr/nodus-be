import { announcementRepository } from './announcement.repository.js';
import type { PublishAnnouncementJob } from '../../queues/announcement.queue.js';

export async function publishAnnouncementJob(
  job: PublishAnnouncementJob
): Promise<boolean> {
  return announcementRepository.publish(
    job.announcementId,
    job.scheduleVersion
  );
}
