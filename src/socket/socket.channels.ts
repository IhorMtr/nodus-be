import { logger } from '../config/logger.js';
import { channelParamsSchema } from '../modules/channels/channel.schema.js';
import { requireChannel } from '../modules/channels/channel.service.js';
import { requireWorkspaceMember } from '../modules/workspaces/workspace.service.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { channelRoom } from './socket.rooms.js';
import { handleSubscription, joinVerified } from './socket.subscriptions.js';
import type { AppSocket, ChannelSubscription } from './socket.types.js';

// ==================== SUBSCRIPTIONS ====================

async function joinChannel(
  socket: AppSocket,
  { workspaceId, channelId }: ChannelSubscription
): Promise<void> {
  const { userId } = socket.data;
  const room = channelRoom(workspaceId, channelId);

  await joinVerified(socket, room, async () => {
    await requireWorkspaceMember(workspaceId, userId);
    await requireChannel(workspaceId, channelId);
  });

  logger.debug({ socketId: socket.id, userId, room }, 'Socket joined channel');
}

async function leaveChannel(
  socket: AppSocket,
  { workspaceId, channelId }: ChannelSubscription
): Promise<void> {
  await socket.leave(channelRoom(workspaceId, channelId));
}

// ==================== PUBLIC API ====================

export function registerChannelHandlers(socket: AppSocket): void {
  socket.on(SOCKET_EVENTS.CHANNEL_JOIN, (payload: unknown, ack: unknown) => {
    void handleSubscription(socket, channelParamsSchema, payload, ack, data =>
      joinChannel(socket, data)
    );
  });

  socket.on(SOCKET_EVENTS.CHANNEL_LEAVE, (payload: unknown, ack: unknown) => {
    void handleSubscription(socket, channelParamsSchema, payload, ack, data =>
      leaveChannel(socket, data)
    );
  });
}
