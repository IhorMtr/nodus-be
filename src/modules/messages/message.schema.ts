import { z } from 'zod';
import { cursorSchema } from '../../shared/pagination/cursor.js';
import {
  pageLimitSchema,
  uuidSchema,
} from '../../shared/validation/schemas.js';
import { channelParamsSchema } from '../channels/channel.schema.js';

// ==================== CONTENT ====================

const contentSchema = z
  .string()
  .trim()
  .min(1, 'Content is required')
  .max(4000, 'Content must not exceed 4000 characters');

export const createMessageSchema = z.strictObject({ content: contentSchema });
export const updateMessageSchema = z.strictObject({ content: contentSchema });

// ==================== PATH PARAMETERS ====================

export const messageParamsSchema = channelParamsSchema.extend({
  messageId: uuidSchema,
});

// ==================== PAGINATION ====================

export const messageHistoryQuerySchema = z
  .strictObject({
    limit: pageLimitSchema,
    before: cursorSchema.optional(),
    after: cursorSchema.optional(),
  })
  .refine(query => !(query.before && query.after), {
    message: 'Use either before or after',
  });
