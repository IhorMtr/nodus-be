import { z } from 'zod';
import {
  createMessageSchema,
  messageHistoryQuerySchema,
} from '../messages/message.schema.js';

// ==================== REQUEST SCHEMAS ====================

const uuid = z.uuid().transform(value => value.toLowerCase());
export const workspaceParamsSchema = z.strictObject({ workspaceId: uuid });
export const conversationParamsSchema = workspaceParamsSchema.extend({
  conversationId: uuid,
});
export const directMessageParamsSchema = conversationParamsSchema.extend({
  messageId: uuid,
});
export const createConversationSchema = z.strictObject({ userId: uuid });
export const directMessageSchema = createMessageSchema;
export const directHistorySchema = messageHistoryQuerySchema;
export const markConversationReadSchema = z.strictObject({
  lastReadMessageId: uuid,
});
