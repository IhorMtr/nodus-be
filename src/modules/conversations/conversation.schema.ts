import { z } from 'zod';
import { cursorSchema } from '../../shared/pagination/cursor.js';
import {
  pageLimitSchema,
  uuidSchema,
} from '../../shared/validation/schemas.js';
import { createMessageSchema } from '../messages/message.schema.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';

// ==================== PATH PARAMETERS ====================

export const conversationParamsSchema = workspaceParamsSchema.extend({
  conversationId: uuidSchema,
});
export const directMessageParamsSchema = conversationParamsSchema.extend({
  messageId: uuidSchema,
});

// ==================== REQUEST SCHEMAS ====================

export const createConversationSchema = z.strictObject({ userId: uuidSchema });
export const directMessageSchema = createMessageSchema;
export const markConversationReadSchema = z.strictObject({
  lastReadMessageId: uuidSchema,
});

// ==================== PAGINATION ====================

export const directHistorySchema = z.strictObject({
  limit: pageLimitSchema,
  before: cursorSchema.optional(),
});
