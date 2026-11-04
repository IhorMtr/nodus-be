import type { PublishAnnouncementJob } from '../../queues/announcement.queue.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import { toPublicNotification } from '../notifications/notification.service.js';
import { announcementRepository } from './announcement.repository.js';

// ==================== PUBLICATION ====================

export async function publishAnnouncementJob(
  job: PublishAnnouncementJob
): Promise<boolean> {
  const notifications = await announcementRepository.publish(
    job.announcementId,
    job.scheduleVersion
  );
  if (!notifications) {
    return false;
  }
  await Promise.all(
    notifications.map(notification =>
      notificationBridge.broadcast({
        kind: 'notification-created',
        notification: toPublicNotification(notification),
      })
    )
  );
  return true;
}
