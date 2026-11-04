import type { z } from 'zod';
import type {
  createMessageSchema,
  messageHistoryQuerySchema,
  messageParamsSchema,
  updateMessageSchema,
} from './message.schema.js';

// ==================== REQUEST TYPES ====================

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type MessageParams = z.infer<typeof messageParamsSchema>;
export type MessageHistoryQuery = z.infer<typeof messageHistoryQuerySchema>;

// ==================== RESPONSE TYPES ====================

export type MessageAuthor = { id: string; firstName: string; lastName: string };

export type PublicMessage = {
  id: string;
  channelId: string;
  author: MessageAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
  receipt?: {
    read: boolean;
    readerCount: number;
    readers: MessageAuthor[];
  };
};

export type MessageHistory = {
  items: PublicMessage[];
  nextCursor: string | null;
  previousCursor: string | null;
};

export type MessageContext = {
  targetMessageId: string;
  items: PublicMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
};
