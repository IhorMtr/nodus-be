import type { z } from 'zod';
import type { MessageAuthor } from '../messages/message.types.js';
import type { PresenceStatus } from '../presence/presence.service.js';
import type {
  conversationParamsSchema,
  createConversationSchema,
  directHistorySchema,
  directMessageParamsSchema,
  directMessageSchema,
  markConversationReadSchema,
} from './conversation.schema.js';

// ==================== REQUEST TYPES ====================

export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type DirectMessageParams = z.infer<typeof directMessageParamsSchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type DirectMessageInput = z.infer<typeof directMessageSchema>;
export type DirectHistoryQuery = z.infer<typeof directHistorySchema>;
export type MarkConversationReadInput = z.infer<
  typeof markConversationReadSchema
>;

// ==================== RESPONSE TYPES ====================

export type PublicDirectMessage = {
  id: string;
  conversationId: string;
  author: MessageAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
  read?: boolean;
};

export type PublicConversation = {
  id: string;
  workspaceId: string;
  otherUser: {
    id: string;
    firstName: string;
    lastName: string;
    status: PresenceStatus;
  };
  createdAt: string;
  updatedAt: string;
  lastMessage: PublicDirectMessage | null;
  unreadCount: number;
  hasUnread: boolean;
};

export type DirectHistory = {
  items: PublicDirectMessage[];
  nextCursor: string | null;
};

export type PublicConversationReadState = {
  lastReadMessageId: string;
  lastReadCreatedAt: string;
  lastReadAt: string;
};
