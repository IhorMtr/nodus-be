import { z } from 'zod';
import { uuidSchema } from '../../shared/validation/schemas.js';

// ==================== WORKSPACE SCHEMAS ====================

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Name must not exceed 100 characters');

export const createWorkspaceSchema = z.strictObject({ name: nameSchema });
export const updateWorkspaceSchema = z.strictObject({ name: nameSchema });

// ==================== PATH PARAMETERS ====================

export const workspaceParamsSchema = z.strictObject({
  workspaceId: uuidSchema,
});
export const workspaceMemberParamsSchema = workspaceParamsSchema.extend({
  userId: uuidSchema,
});

// ==================== MEMBERSHIP SCHEMAS ====================

export const updateMemberRoleSchema = z.strictObject({
  role: z.enum(['Admin', 'Member']),
});
