import { announcementRepository } from './announcement.repository.js';
import type { PublishAnnouncementJob } from '../../queues/announcement.queue.js';
import { socketPublisher } from '../../socket/socket.publisher.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import { toPublicNotification } from '../notifications/notification.service.js';

export async function publishAnnouncementJob(
  job: PublishAnnouncementJob
): Promise<boolean> {
  const notifications = await announcementRepository.publish(
    job.announcementId,
    job.scheduleVersion
  );
  if (!notifications) return false;
  for (const notification of notifications) {
    const publicNotification = toPublicNotification(notification);
    if (socketPublisher.hasServer())
      socketPublisher.publishNotificationCreated(publicNotification);
    else await notificationBridge.publish(publicNotification);
  }
  return true;
}
