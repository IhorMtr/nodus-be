import { logger } from '../config/logger.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import { redis } from '../redis/client.js';
import { socketPublisher } from './socket.publisher.js';

// ==================== TRANSPORT ====================

const channel = 'nodus:notification:created';

class NotificationBridge {
  #subscriber: ReturnType<typeof redis.duplicate> | undefined;

  async start(): Promise<void> {
    if (this.#subscriber) return;
    const subscriber = redis.duplicate();
    subscriber.on('error', error =>
      logger.error({ err: error }, 'Notification subscription failed')
    );
    subscriber.on('message', (_channel, payload) => {
      try {
        const notification = JSON.parse(payload) as PublicNotification;
        socketPublisher.publishNotificationCreated(notification);
      } catch (error) {
        logger.error({ err: error }, 'Invalid notification transport payload');
      }
    });
    try {
      await subscriber.connect();
      await subscriber.subscribe(channel);
      this.#subscriber = subscriber;
    } catch (error) {
      subscriber.disconnect();
      throw error;
    }
  }

  async publish(notification: PublicNotification): Promise<void> {
    try {
      if (redis.status !== 'ready') await redis.connect();
      await redis.publish(channel, JSON.stringify(notification));
    } catch (error) {
      logger.error(
        { err: error, notificationId: notification.id },
        'Notification transport failed'
      );
    }
  }

  async close(): Promise<void> {
    const subscriber = this.#subscriber;
    this.#subscriber = undefined;
    if (!subscriber) return;
    if (subscriber.status === 'ready') await subscriber.quit();
    else subscriber.disconnect();
  }
}

// ==================== PUBLIC API ====================

export const notificationBridge = new NotificationBridge();
