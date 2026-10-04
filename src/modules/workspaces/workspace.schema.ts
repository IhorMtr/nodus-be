import { z } from 'zod';

const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters');

export const createWorkspaceSchema = z.strictObject({ name: nameSchema });
export const updateWorkspaceSchema = z.strictObject({ name: nameSchema });

// PostgreSQL UUID comparisons are case insensitive; normalize before self checks.
const uuidSchema = z.uuid().transform((value) => value.toLowerCase());

export const workspaceParamsSchema = z.strictObject({ workspaceId: uuidSchema });
export const workspaceMemberParamsSchema = workspaceParamsSchema.extend({ userId: uuidSchema });
export const updateMemberRoleSchema = z.strictObject({ role: z.enum(['Admin', 'Member']) });
