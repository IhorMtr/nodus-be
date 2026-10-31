import type { Server, Socket } from 'socket.io';

import type { PublicMessage } from '../modules/messages/message.types.js';
import type { PublicNotification } from '../modules/notifications/notification.types.js';
import type { ApiResponse } from '../shared/types/api-response.js';
import type { SOCKET_EVENTS } from './socket-events.js';

// ==================== PAYLOADS ====================

export type ChannelSubscription = {
  workspaceId: string;
  channelId: string;
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
  [SOCKET_EVENTS.MESSAGE_CREATED]: (payload: MessagePayload) => void;
  [SOCKET_EVENTS.MESSAGE_UPDATED]: (payload: MessagePayload) => void;
  [SOCKET_EVENTS.MESSAGE_DELETED]: (payload: MessageDeletedPayload) => void;
  [SOCKET_EVENTS.WORKSPACE_ACCESS_REVOKED]: (
    payload: WorkspaceAccessRevokedPayload
  ) => void;
  [SOCKET_EVENTS.NOTIFICATION_CREATED]: (payload: PublicNotification) => void;
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
