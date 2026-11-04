import { z } from 'zod';
import { uuidSchema } from '../../shared/validation/schemas.js';

// ==================== REQUESTS ====================

export const notificationParamsSchema = z.strictObject({
  notificationId: uuidSchema,
});

export const notificationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
