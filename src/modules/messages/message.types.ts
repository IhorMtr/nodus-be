import type { z } from 'zod';
import type {
  createMessageSchema,
  messageChannelParamsSchema,
  messageHistoryQuerySchema,
  messageParamsSchema,
  updateMessageSchema,
} from './message.schema.js';

// ==================== REQUEST TYPES ====================

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageChannelParams = z.infer<typeof messageChannelParamsSchema>;
export type MessageParams = z.infer<typeof messageParamsSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;
export type MessageCursor = NonNullable<MessageHistoryQuery['before']>;

// ==================== RESPONSE TYPES ====================

export type PublicMessage = {
  id: string;
  channelId: string;
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageHistory = {
  items: PublicMessage[];
  nextCursor: string | null;
};
