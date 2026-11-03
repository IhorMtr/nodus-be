import type { Server, Socket } from 'socket.io';

import type { PublicMessage } from '../modules/messages/message.types.js';
import type { PublicDirectMessage } from '../modules/conversations/conversation.types.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import type { PresenceUpdate } from '../modules/presence/presence.service.js';
import type { ApiResponse } from '../shared/types/api-response.js';
import type { SOCKET_EVENTS } from './socket-events.js';

// ==================== PAYLOADS ====================

export type ChannelSubscription = {
  workspaceId: string;
  channelId: string;
};

export type ConversationSubscription = {
  workspaceId: string;
  conversationId: string;
};
export type DirectMessagePayload = {
  workspaceId: string;
  message: PublicDirectMessage;
};
export type DirectMessageDeletedPayload = {
  workspaceId: string;
  conversationId: string;
  messageId: string;
};

export type DirectReadPayload = {
  workspaceId: string;
  conversationId: string;
  readerId: string;
  lastReadMessageId: string;
  lastReadCreatedAt: string;
  lastReadAt: string;
};
export type ChannelReadPayload = {
  workspaceId: string;
  channelId: string;
  reader: { id: string; firstName: string; lastName: string };
  lastReadMessageId: string;
  lastReadCreatedAt: string;
};
export type NotificationsReadPayload = {
  userId: string;
  notificationIds: string[];
  unreadCount: number;
};

export type MessagePayload = {
  workspaceId: string;
  message: PublicMessage;
};

export type MessageDeletedPayload = {
  workspaceId: string;
  channelId: string;
  messageId: string;
};

export type WorkspaceAccessRevokedPayload = {
  workspaceId: string;
};

// Acknowledgements reuse the REST envelope so clients handle one response shape.
export type SocketAck<T> = ApiResponse<T>;

// ==================== EVENT MAPS ====================

export type ClientToServerEvents = {
  [SOCKET_EVENTS.CONVERSATION_JOIN]: (
    payload: ConversationSubscription,
    ack: (response: SocketAck<ConversationSubscription>) => void
  ) => void;
  [SOCKET_EVENTS.CONVERSATION_LEAVE]: (
    payload: ConversationSubscription,
    ack: (response: SocketAck<ConversationSubscription>) => void
  ) => void;
  [SOCKET_EVENTS.CHANNEL_JOIN]: (
    payload: ChannelSubscription,
    ack: (response: SocketAck<ChannelSubscription>) => void
  ) => void;
  [SOCKET_EVENTS.CHANNEL_LEAVE]: (
    payload: ChannelSubscription,
    ack: (response: SocketAck<ChannelSubscription>) => void
  ) => void;
};

export type ServerToClientEvents = {
  [SOCKET_EVENTS.DIRECT_MESSAGE_CREATED]: (
    payload: DirectMessagePayload
  ) => void;
  [SOCKET_EVENTS.DIRECT_MESSAGE_UPDATED]: (
    payload: DirectMessagePayload
  ) => void;
  [SOCKET_EVENTS.DIRECT_MESSAGE_DELETED]: (
    payload: DirectMessageDeletedPayload
  ) => void;
  [SOCKET_EVENTS.DIRECT_MESSAGE_READ]: (payload: DirectReadPayload) => void;
  [SOCKET_EVENTS.MESSAGE_READ]: (payload: ChannelReadPayload) => void;
  [SOCKET_EVENTS.NOTIFICATIONS_READ]: (
    payload: NotificationsReadPayload
  ) => void;
  [SOCKET_EVENTS.MESSAGE_CREATED]: (payload: MessagePayload) => void;
  [SOCKET_EVENTS.MESSAGE_UPDATED]: (payload: MessagePayload) => void;
  [SOCKET_EVENTS.MESSAGE_DELETED]: (payload: MessageDeletedPayload) => void;
  [SOCKET_EVENTS.WORKSPACE_ACCESS_REVOKED]: (
    payload: WorkspaceAccessRevokedPayload
  ) => void;
  [SOCKET_EVENTS.NOTIFICATION_CREATED]: (payload: PublicNotification) => void;
  [SOCKET_EVENTS.PRESENCE_UPDATED]: (payload: PresenceUpdate) => void;
};

export type InterServerEvents = Record<never, never>;

export type SocketData = {
  userId: string;
};

// ==================== INSTANCES ====================

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
