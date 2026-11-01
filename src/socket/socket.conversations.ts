import { logger } from '../config/logger.js';
import { conversationParamsSchema } from '../modules/conversations/conversation.schema.js';
import { requireConversation } from '../modules/conversations/conversation.service.js';
import { AppError } from '../shared/errors/app-error.js';
import {
  errorResponse,
  successResponse,
} from '../shared/utils/api-response.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { conversationRoom } from './socket.rooms.js';
import type { AppSocket, ConversationSubscription } from './socket.types.js';

// ==================== ACKNOWLEDGEMENTS ====================

function respond(ack: unknown, response: unknown): void {
  if (typeof ack === 'function') ack(response);
}

async function subscribe(
  socket: AppSocket,
  payload: unknown,
  ack: unknown,
  join: boolean
): Promise<void> {
  const parsed = conversationParamsSchema.safeParse(payload);
  if (!parsed.success) {
    respond(ack, errorResponse('ValidationFailed'));
    return;
  }
  const subscription: ConversationSubscription = parsed.data;
  const { workspaceId, conversationId } = subscription;
  const room = conversationRoom(workspaceId, conversationId);
  try {
    if (join) {
      await requireConversation(
        workspaceId,
        socket.data.userId,
        conversationId
      );
      await socket.join(room);
      try {
        await requireConversation(
          workspaceId,
          socket.data.userId,
          conversationId
        );
      } catch (error) {
        await socket.leave(room);
        throw error;
      }
    } else await socket.leave(room);
    respond(ack, successResponse(subscription));
  } catch (error) {
    if (error instanceof AppError) respond(ack, errorResponse(error.code));
    else {
      logger.error(
        { err: error, socketId: socket.id },
        'Conversation subscription failed'
      );
      respond(ack, errorResponse('InternalError'));
    }
  }
}

// ==================== PUBLIC API ====================

export function registerConversationHandlers(socket: AppSocket): void {
  socket.on(
    SOCKET_EVENTS.CONVERSATION_JOIN,
    (payload: unknown, ack: unknown) => {
      void subscribe(socket, payload, ack, true);
    }
  );
  socket.on(
    SOCKET_EVENTS.CONVERSATION_LEAVE,
    (payload: unknown, ack: unknown) => {
      void subscribe(socket, payload, ack, false);
    }
  );
}
