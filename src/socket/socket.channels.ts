import { logger } from '../config/logger.js';
import { channelParamsSchema } from '../modules/channels/channel.schema.js';
import { requireChannel } from '../modules/channels/channel.service.js';
import { requireWorkspaceMember } from '../modules/workspaces/workspace.service.js';
import { AppError } from '../shared/errors/app-error.js';
import { errorResponse, successResponse } from '../shared/utils/api-response.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { channelRoom } from './socket.rooms.js';
import type { AppSocket, ChannelSubscription } from './socket.types.js';

// ==================== ACKNOWLEDGEMENTS ====================

// Clients may omit the ack callback; the payload and callback are untrusted input.
function respond(ack: unknown, response: unknown): void {
  if (typeof ack === 'function') ack(response);
}

async function handleSubscription(
  socket: AppSocket,
  payload: unknown,
  ack: unknown,
  apply: (subscription: ChannelSubscription) => Promise<void>,
): Promise<void> {
  try {
    const parsed = channelParamsSchema.safeParse(payload);
    if (!parsed.success) {
      respond(ack, errorResponse('ValidationFailed'));
      return;
    }

    await apply(parsed.data);
    respond(ack, successResponse(parsed.data));
  } catch (error) {
    if (error instanceof AppError) {
      respond(ack, errorResponse(error.code));
      return;
    }

    logger.error({ err: error, socketId: socket.id }, 'Channel subscription failed');
    respond(ack, errorResponse('InternalError'));
  }
}

// ==================== SUBSCRIPTIONS ====================

async function joinChannel(socket: AppSocket, { workspaceId, channelId }: ChannelSubscription): Promise<void> {
  const { userId } = socket.data;

  // Same rules as REST: outsiders get WorkspaceNotFound, a foreign channel gets ChannelNotFound.
  await requireWorkspaceMember(workspaceId, userId);
  await requireChannel(workspaceId, channelId);

  const room = channelRoom(workspaceId, channelId);
  await socket.join(room);

  // A member removal can commit while the checks above are in flight; its room cleanup
  // may already have run, so verify again and fail closed.
  try {
    await requireWorkspaceMember(workspaceId, userId);
  } catch (error) {
    await socket.leave(room);
    throw error;
  }
}

async function leaveChannel(socket: AppSocket, { workspaceId, channelId }: ChannelSubscription): Promise<void> {
  // Leaving only drops a local subscription, so no database check is needed.
  await socket.leave(channelRoom(workspaceId, channelId));
}

export function registerChannelHandlers(socket: AppSocket): void {
  socket.on(SOCKET_EVENTS.CHANNEL_JOIN, (payload: unknown, ack: unknown) => {
    void handleSubscription(socket, payload, ack, (subscription) => joinChannel(socket, subscription));
  });

  socket.on(SOCKET_EVENTS.CHANNEL_LEAVE, (payload: unknown, ack: unknown) => {
    void handleSubscription(socket, payload, ack, (subscription) => leaveChannel(socket, subscription));
  });
}
