import { conversationParamsSchema } from '../modules/conversations/conversation.schema.js';
import { requireConversation } from '../modules/conversations/conversation.service.js';
import { SOCKET_EVENTS } from './socket-events.js';
import { conversationRoom } from './socket.rooms.js';
import { handleSubscription, joinVerified } from './socket.subscriptions.js';
import type { AppSocket, ConversationSubscription } from './socket.types.js';

// ==================== SUBSCRIPTIONS ====================

async function joinConversation(
  socket: AppSocket,
  { workspaceId, conversationId }: ConversationSubscription
): Promise<void> {
  await joinVerified(
    socket,
    conversationRoom(workspaceId, conversationId),
    () => requireConversation(workspaceId, socket.data.userId, conversationId)
  );
}

async function leaveConversation(
  socket: AppSocket,
  { workspaceId, conversationId }: ConversationSubscription
): Promise<void> {
  await socket.leave(conversationRoom(workspaceId, conversationId));
}

// ==================== PUBLIC API ====================

export function registerConversationHandlers(socket: AppSocket): void {
  socket.on(
    SOCKET_EVENTS.CONVERSATION_JOIN,
    (payload: unknown, ack: unknown) => {
      void handleSubscription(
        socket,
        conversationParamsSchema,
        payload,
        ack,
        data => joinConversation(socket, data)
      );
    }
  );

  socket.on(
    SOCKET_EVENTS.CONVERSATION_LEAVE,
    (payload: unknown, ack: unknown) => {
      void handleSubscription(
        socket,
        conversationParamsSchema,
        payload,
        ack,
        data => leaveConversation(socket, data)
      );
    }
  );
}
