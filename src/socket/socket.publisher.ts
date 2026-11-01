import { logger } from '../config/logger.js';
import type { PublicMessage } from '../modules/messages/message.types.js';
import type { PublicDirectMessage } from '../modules/conversations/conversation.types.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import type { PresenceUpdate } from '../modules/presence/presence.service.js';
import { SOCKET_EVENTS } from './socket-events.js';
import {
  channelRoom,
  channelRoomPrefix,
  conversationRoom,
  conversationRoomPrefix,
  userRoom,
} from './socket.rooms.js';
import type { SocketServer } from './socket.types.js';

// ==================== PUBLISHER ====================

class SocketPublisher {
  // ==================== SERVER BINDING ====================

  #socketServer: SocketServer | undefined;

  bind(io: SocketServer): void {
    this.#socketServer = io;
  }

  hasServer(): boolean {
    return this.#socketServer !== undefined;
  }

  // Publishing happens after the database commit, so it must never fail the request.
  #publish(operation: string, send: (io: SocketServer) => void): void {
    if (!this.#socketServer) return;

    try {
      send(this.#socketServer);
    } catch (error) {
      logger.error({ err: error, operation }, 'Realtime publish failed');
    }
  }

  // ==================== MESSAGE EVENTS ====================

  publishMessageCreated(workspaceId: string, message: PublicMessage): void {
    this.#publish('message:created', io => {
      io.to(channelRoom(workspaceId, message.channelId)).emit(
        SOCKET_EVENTS.MESSAGE_CREATED,
        { workspaceId, message }
      );
    });
  }

  publishMessageUpdated(workspaceId: string, message: PublicMessage): void {
    this.#publish('message:updated', io => {
      io.to(channelRoom(workspaceId, message.channelId)).emit(
        SOCKET_EVENTS.MESSAGE_UPDATED,
        { workspaceId, message }
      );
    });
  }

  publishMessageDeleted(
    workspaceId: string,
    channelId: string,
    messageId: string
  ): void {
    this.#publish('message:deleted', io => {
      io.to(channelRoom(workspaceId, channelId)).emit(
        SOCKET_EVENTS.MESSAGE_DELETED,
        { workspaceId, channelId, messageId }
      );
    });
  }

  // ==================== DIRECT MESSAGE EVENTS ====================

  publishDirectMessageCreated(
    workspaceId: string,
    message: PublicDirectMessage
  ): void {
    this.#publish('direct-message:created', io =>
      io
        .to(conversationRoom(workspaceId, message.conversationId))
        .emit(SOCKET_EVENTS.DIRECT_MESSAGE_CREATED, { workspaceId, message })
    );
  }

  publishDirectMessageUpdated(
    workspaceId: string,
    message: PublicDirectMessage
  ): void {
    this.#publish('direct-message:updated', io =>
      io
        .to(conversationRoom(workspaceId, message.conversationId))
        .emit(SOCKET_EVENTS.DIRECT_MESSAGE_UPDATED, { workspaceId, message })
    );
  }

  publishDirectMessageDeleted(
    workspaceId: string,
    conversationId: string,
    messageId: string
  ): void {
    this.#publish('direct-message:deleted', io =>
      io
        .to(conversationRoom(workspaceId, conversationId))
        .emit(SOCKET_EVENTS.DIRECT_MESSAGE_DELETED, {
          workspaceId,
          conversationId,
          messageId,
        })
    );
  }

  // ==================== NOTIFICATIONS ====================

  publishNotificationCreated(notification: PublicNotification): void {
    this.#publish('notification:created', io => {
      io.to(userRoom(notification.userId)).emit(
        SOCKET_EVENTS.NOTIFICATION_CREATED,
        notification
      );
    });
  }

  // ==================== PRESENCE ====================

  publishPresenceUpdated(update: PresenceUpdate, recipientIds: string[]): void {
    if (recipientIds.length === 0) return;
    this.#publish('presence:updated', io => {
      io.to(recipientIds.map(userRoom)).emit(
        SOCKET_EVENTS.PRESENCE_UPDATED,
        update
      );
    });
  }

  // ==================== ACCESS REVOCATION ====================

  // Drops every channel and conversation subscription of the users in the workspace
  // across all their sockets, then tells those sockets that access was revoked.
  async revokeWorkspaceAccess(
    workspaceId: string,
    userIds: readonly string[]
  ): Promise<void> {
    if (!this.#socketServer || userIds.length === 0) return;

    try {
      const userSockets = this.#socketServer.in(userIds.map(userRoom));
      const prefixes = [
        channelRoomPrefix(workspaceId),
        conversationRoomPrefix(workspaceId),
      ];
      const rooms = new Set<string>();

      for (const socket of await userSockets.fetchSockets()) {
        for (const room of socket.rooms) {
          if (prefixes.some(prefix => room.startsWith(prefix))) rooms.add(room);
        }
      }

      if (rooms.size > 0) userSockets.socketsLeave([...rooms]);
      userSockets.emit(SOCKET_EVENTS.WORKSPACE_ACCESS_REVOKED, { workspaceId });
    } catch (error) {
      logger.error(
        { err: error, workspaceId },
        'Workspace access revocation failed'
      );
    }
  }
}

// ==================== PUBLIC API ====================

export const socketPublisher = new SocketPublisher();
