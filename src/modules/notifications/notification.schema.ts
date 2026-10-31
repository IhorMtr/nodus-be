import { z } from 'zod';

// ==================== REQUESTS ====================

export const notificationParamsSchema = z.strictObject({
  notificationId: z.uuid().transform(value => value.toLowerCase()),
});

export const notificationListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
