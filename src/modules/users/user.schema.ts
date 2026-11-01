import { z } from 'zod';

// ==================== REQUEST SCHEMAS ====================

export const updateStatusSchema = z.strictObject({
  status: z.enum(['online', 'away', 'dnd']),
});
