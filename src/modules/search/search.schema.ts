import { z } from 'zod';
import { cursorSchema } from '../../shared/pagination/cursor.js';
import {
  pageLimitSchema,
  uuidSchema,
} from '../../shared/validation/schemas.js';

// ==================== VALIDATION ====================

export const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(3).max(200),
  channelId: uuidSchema.optional(),
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
});
