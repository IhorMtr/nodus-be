import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';
import type { PublicDirectMessage } from '../modules/conversations/conversation.types.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import { redis } from '../redis/client.js';
import { socketPublisher } from './socket.publisher.js';
import type {
  DirectReadPayload,
  ChannelReadPayload,
  NotificationsReadPayload,
} from './socket.types.js';

// ==================== TRANSPORT ====================

const channel = 'nodus:notification:created';

type DirectTransport =
  | {
      kind: 'direct-created' | 'direct-updated';
      origin: string;
      workspaceId: string;
      message: PublicDirectMessage;
    }
  | {
      kind: 'direct-deleted';
      origin: string;
      workspaceId: string;
      conversationId: string;
      messageId: string;
    }
  | {
      kind: 'direct-notification';
      origin: string;
      notification: PublicNotification;
    }
  | {
      kind: 'direct-read';
      origin: string;
      payload: DirectReadPayload;
      recipientIds: string[];
    }
  | {
      kind: 'channel-read';
      origin: string;
      payload: ChannelReadPayload;
      recipientIds: string[];
    }
  | {
      kind: 'notifications-read';
      origin: string;
      payload: NotificationsReadPayload;
    }
  | {
      kind: 'workspace-revoked';
      origin: string;
      workspaceId: string;
      userIds: string[];
    };
type DirectPublish = DirectTransport extends infer T
  ? T extends { origin: string }
    ? Omit<T, 'origin'>
    : never
  : never;

class NotificationBridge {
  #origin = randomUUID();
  #subscriber: ReturnType<typeof redis.duplicate> | undefined;

  async start(): Promise<void> {
    if (this.#subscriber) return;
    const subscriber = redis.duplicate();
    subscriber.on('error', error =>
      logger.error({ err: error }, 'Notification subscription failed')
    );
    subscriber.on('message', (_channel, payload) => {
      try {
        const data = JSON.parse(payload) as
          PublicNotification | DirectTransport;
        if ('kind' in data) {
          if (data.origin === this.#origin) return;
          switch (data.kind) {
            case 'direct-created':
              socketPublisher.publishDirectMessageCreated(
                data.workspaceId,
                data.message
              );
              break;
            case 'direct-updated':
              socketPublisher.publishDirectMessageUpdated(
                data.workspaceId,
                data.message
              );
              break;
            case 'direct-deleted':
              socketPublisher.publishDirectMessageDeleted(
                data.workspaceId,
                data.conversationId,
                data.messageId
              );
              break;
            case 'direct-notification':
              socketPublisher.publishNotificationCreated(data.notification);
              break;
            case 'direct-read':
              socketPublisher.publishDirectRead(
                data.payload,
                data.recipientIds
              );
              break;
            case 'channel-read':
              socketPublisher.publishChannelRead(
                data.payload,
                data.recipientIds
              );
              break;
            case 'notifications-read':
              socketPublisher.publishNotificationsRead(data.payload);
              break;
            case 'workspace-revoked':
              void socketPublisher.revokeWorkspaceAccess(
                data.workspaceId,
                data.userIds
              );
              break;
          }
        } else socketPublisher.publishNotificationCreated(data);
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

  async publishDirect(event: DirectPublish): Promise<void> {
    try {
      if (redis.status !== 'ready') await redis.connect();
      await redis.publish(
        channel,
        JSON.stringify({ ...event, origin: this.#origin })
      );
    } catch (error) {
      logger.error(
        { err: error, kind: event.kind },
        'Direct realtime transport failed'
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
