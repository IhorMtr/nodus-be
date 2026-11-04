import { randomUUID } from 'node:crypto';
import { logger } from '../config/logger.js';
import type { PublicDirectMessage } from '../modules/conversations/conversation.types.js';
import type { PublicMessage } from '../modules/messages/message.types.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import { redis } from '../redis/client.js';
import { socketPublisher } from './socket.publisher.js';
import type {
  ChannelReadPayload,
  DirectReadPayload,
  NotificationsReadPayload,
} from './socket.types.js';

// ==================== TYPES ====================

export type RealtimeEvent =
  | {
      kind: 'message-created' | 'message-updated';
      workspaceId: string;
      message: PublicMessage;
    }
  | {
      kind: 'message-deleted';
      workspaceId: string;
      channelId: string;
      messageId: string;
    }
  | {
      kind: 'direct-created' | 'direct-updated';
      workspaceId: string;
      message: PublicDirectMessage;
    }
  | {
      kind: 'direct-deleted';
      workspaceId: string;
      conversationId: string;
      messageId: string;
    }
  | { kind: 'notification-created'; notification: PublicNotification }
  | { kind: 'direct-read'; payload: DirectReadPayload; recipientIds: string[] }
  | {
      kind: 'channel-read';
      payload: ChannelReadPayload;
      recipientIds: string[];
    }
  | { kind: 'notifications-read'; payload: NotificationsReadPayload }
  | { kind: 'workspace-revoked'; workspaceId: string; userIds: string[] };

type RealtimeTransport = RealtimeEvent & { origin: string };

// ==================== CONSTANTS ====================

const channel = 'nodus:notification:created';

// ==================== BRIDGE ====================

class NotificationBridge {
  #origin = randomUUID();
  #subscriber: ReturnType<typeof redis.duplicate> | undefined;

  // ==================== DELIVERY ====================

  async broadcast(event: RealtimeEvent): Promise<void> {
    await this.#deliver(event);
    await this.#relay(event);
  }

  async #deliver(event: RealtimeEvent): Promise<void> {
    switch (event.kind) {
      case 'message-created':
        socketPublisher.publishMessageCreated(event.workspaceId, event.message);
        break;
      case 'message-updated':
        socketPublisher.publishMessageUpdated(event.workspaceId, event.message);
        break;
      case 'message-deleted':
        socketPublisher.publishMessageDeleted(
          event.workspaceId,
          event.channelId,
          event.messageId
        );
        break;
      case 'direct-created':
        socketPublisher.publishDirectMessageCreated(
          event.workspaceId,
          event.message
        );
        break;
      case 'direct-updated':
        socketPublisher.publishDirectMessageUpdated(
          event.workspaceId,
          event.message
        );
        break;
      case 'direct-deleted':
        socketPublisher.publishDirectMessageDeleted(
          event.workspaceId,
          event.conversationId,
          event.messageId
        );
        break;
      case 'notification-created':
        socketPublisher.publishNotificationCreated(event.notification);
        break;
      case 'direct-read':
        socketPublisher.publishDirectRead(event.payload, event.recipientIds);
        break;
      case 'channel-read':
        socketPublisher.publishChannelRead(event.payload, event.recipientIds);
        break;
      case 'notifications-read':
        socketPublisher.publishNotificationsRead(event.payload);
        break;
      case 'workspace-revoked':
        try {
          await socketPublisher.revokeWorkspaceAccess(
            event.workspaceId,
            event.userIds
          );
        } catch (error) {
          logger.error(
            { err: error, workspaceId: event.workspaceId },
            'Realtime revocation failed'
          );
        }
        break;
    }
  }

  async #relay(event: RealtimeEvent): Promise<void> {
    const transport: RealtimeTransport = { ...event, origin: this.#origin };
    try {
      if (redis.status !== 'ready') {
        await redis.connect();
      }
      await redis.publish(channel, JSON.stringify(transport));
    } catch (error) {
      logger.error(
        { err: error, kind: event.kind },
        'Realtime transport failed'
      );
    }
  }

  #receive(payload: string): void {
    try {
      const transport = JSON.parse(payload) as RealtimeTransport;
      if (transport.origin !== this.#origin) {
        void this.#deliver(transport);
      }
    } catch (error) {
      logger.error({ err: error }, 'Invalid realtime transport payload');
    }
  }

  // ==================== LIFECYCLE ====================

  async start(): Promise<void> {
    if (this.#subscriber) {
      return;
    }
    const subscriber = redis.duplicate();
    subscriber.on('error', error =>
      logger.error({ err: error }, 'Realtime subscription failed')
    );
    subscriber.on('message', (_channel, payload) => this.#receive(payload));
    try {
      await subscriber.connect();
      await subscriber.subscribe(channel);
      this.#subscriber = subscriber;
    } catch (error) {
      subscriber.disconnect();
      throw error;
    }
  }

  async close(): Promise<void> {
    const subscriber = this.#subscriber;
    this.#subscriber = undefined;
    if (!subscriber) {
      return;
    }
    if (subscriber.status === 'ready') {
      await subscriber.quit();
    } else {
      subscriber.disconnect();
    }
  }
}

// ==================== PUBLIC API ====================

export const notificationBridge = new NotificationBridge();
