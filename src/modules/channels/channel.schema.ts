import { z } from 'zod';

// ==================== FIELD SCHEMAS ====================

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must not exceed 80 characters');
const uuidSchema = z.uuid().transform(value => value.toLowerCase());

// ==================== REQUEST SCHEMAS ====================

export const createChannelSchema = z.strictObject({ name: nameSchema });
export const updateChannelSchema = z.strictObject({ name: nameSchema });
export const channelWorkspaceParamsSchema = z.strictObject({
  workspaceId: uuidSchema,
});
export const channelParamsSchema = channelWorkspaceParamsSchema.extend({
  channelId: uuidSchema,
});
