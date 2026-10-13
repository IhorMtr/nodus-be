import { z } from 'zod';
import { channelParamsSchema } from '../channels/channel.schema.js';

// ==================== CONTENT ====================

const contentSchema = z.string().trim()
  .min(1, 'Content is required')
  .max(4000, 'Content must not exceed 4000 characters');

export const createMessageSchema = z.strictObject({ content: contentSchema });
export const updateMessageSchema = z.strictObject({ content: contentSchema });
export const messageChannelParamsSchema = channelParamsSchema;
export const messageParamsSchema = messageChannelParamsSchema.extend({
  messageId: z.uuid().transform((value) => value.toLowerCase()),
});

// ==================== PAGINATION ====================

const cursorPayloadSchema = z.strictObject({
  createdAt: z.iso.datetime({ precision: 3 }),
  id: z.uuid().transform((value) => value.toLowerCase()),
});

const cursorSchema = z.string().min(1).max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid pagination cursor')
  .transform((value, context) => {
    try {
      const decoded = Buffer.from(value, 'base64url');
      if (decoded.toString('base64url') !== value) throw new Error('Invalid encoding');
      const payload = cursorPayloadSchema.parse(JSON.parse(decoded.toString('utf8')));
      const createdAt = new Date(payload.createdAt);
      if (createdAt.toISOString() !== payload.createdAt) throw new Error('Invalid timestamp');
      return { createdAt, id: payload.id };
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid pagination cursor' });
      return z.NEVER;
    }
  });

export const messageHistoryQuerySchema = z.strictObject({
  limit: z.string().regex(/^[0-9]+$/, 'Limit must be an integer')
    .transform(Number).pipe(z.number().int().min(1).max(100)).default(50),
  before: cursorSchema.optional(),
});
