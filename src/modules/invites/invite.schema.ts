import { z } from 'zod';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';

export const inviteTokenSchema = z.strictObject({ token: z.string().min(1).max(256) });
export const inviteParamsSchema = workspaceParamsSchema.extend({
  inviteId: z.uuid().transform((value) => value.toLowerCase()),
});
