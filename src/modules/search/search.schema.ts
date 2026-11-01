import { z } from 'zod';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';
import { cursorSchema } from '../messages/message.schema.js';

// ==================== VALIDATION ====================

export const searchParamsSchema = workspaceParamsSchema;

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(3).max(200),
  channelId: z
    .uuid()
    .transform(value => value.toLowerCase())
    .optional(),
  limit: z
    .string()
    .regex(/^[0-9]+$/, 'Limit must be an integer')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .default(50),
  cursor: cursorSchema.optional(),
});
