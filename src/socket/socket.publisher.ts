import { logger } from '../config/logger.js';
import type { PublicMessage } from '../modules/messages/message.types.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { channelRoom, channelRoomPrefix, userRoom } from './socket.rooms.js';
import type { SocketServer } from './socket.types.js';

// ==================== SERVER BINDING ====================

let socketServer: SocketServer | undefined;

export function bindSocketPublisher(io: SocketServer): void {
  socketServer = io;
}

// Publishing happens after the database commit, so it must never fail the request.
function publish(operation: string, send: (io: SocketServer) => void): void {
  if (!socketServer) return;

  try {
    send(socketServer);
  } catch (error) {
    logger.error({ err: error, operation }, 'Realtime publish failed');
  }
}

// ==================== MESSAGE EVENTS ====================

export function publishMessageCreated(
  workspaceId: string,
  message: PublicMessage
): void {
  publish('message:created', io => {
    const room = channelRoom(workspaceId, message.channelId);
    logger.info(
      {
        workspaceId,
        channelId: message.channelId,
        messageId: message.id,
        room,
        roomSize: io.sockets.adapter.rooms.get(room)?.size ?? 0,
      },
      'Publishing message:created'
    );
    io.to(room).emit(SOCKET_EVENTS.MESSAGE_CREATED, { workspaceId, message });
  });
}

export function publishMessageUpdated(
  workspaceId: string,
  message: PublicMessage
): void {
  publish('message:updated', io => {
    io.to(channelRoom(workspaceId, message.channelId)).emit(
      SOCKET_EVENTS.MESSAGE_UPDATED,
      { workspaceId, message }
    );
  });
}

export function publishMessageDeleted(
  workspaceId: string,
  channelId: string,
  messageId: string
): void {
  publish('message:deleted', io => {
    io.to(channelRoom(workspaceId, channelId)).emit(
      SOCKET_EVENTS.MESSAGE_DELETED,
      { workspaceId, channelId, messageId }
    );
  });
}

// ==================== ACCESS REVOCATION ====================

// Drops every channel subscription of the user in the workspace across all their sockets.
export async function revokeWorkspaceAccess(
  workspaceId: string,
  userId: string
): Promise<void> {
  if (!socketServer) return;

  try {
    const userSockets = socketServer.in(userRoom(userId));
    const prefix = channelRoomPrefix(workspaceId);
    const rooms = new Set<string>();

    for (const socket of await userSockets.fetchSockets()) {
      for (const room of socket.rooms) {
        if (room.startsWith(prefix)) rooms.add(room);
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
