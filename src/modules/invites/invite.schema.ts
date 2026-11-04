import { z } from 'zod';
import { uuidSchema } from '../../shared/validation/schemas.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';

// ==================== REQUEST SCHEMAS ====================

export const inviteTokenSchema = z.strictObject({
  token: z.string().min(1).max(256),
});

// ==================== PATH PARAMETERS ====================

export const inviteParamsSchema = workspaceParamsSchema.extend({
  inviteId: uuidSchema,
});
