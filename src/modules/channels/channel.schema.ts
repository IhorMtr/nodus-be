import { z } from 'zod';
import { uuidSchema } from '../../shared/validation/schemas.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';

// ==================== FIELD SCHEMAS ====================

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must not exceed 80 characters');

// ==================== REQUEST SCHEMAS ====================

export const createChannelSchema = z.strictObject({ name: nameSchema });
export const updateChannelSchema = z.strictObject({ name: nameSchema });
export const markChannelReadSchema = z.strictObject({
  lastReadMessageId: uuidSchema,
});

// ==================== PATH PARAMETERS ====================

export const channelParamsSchema = workspaceParamsSchema.extend({
  channelId: uuidSchema,
});
