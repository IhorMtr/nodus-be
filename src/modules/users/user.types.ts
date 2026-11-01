import type { z } from 'zod';
import type { updateStatusSchema } from './user.schema.js';

// ==================== REQUEST TYPES ====================

export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

// ==================== RESPONSE TYPES ====================

export type PublicUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};
