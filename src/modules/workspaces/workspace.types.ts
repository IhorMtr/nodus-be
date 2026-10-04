import type { z } from 'zod';
import type { WorkspaceRole } from '../../generated/prisma/client.js';
import type {
  createWorkspaceSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceMemberParamsSchema,
  workspaceParamsSchema,
} from './workspace.schema.js';

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type WorkspaceParams = z.infer<typeof workspaceParamsSchema>;
export type WorkspaceMemberParams = z.infer<typeof workspaceMemberParamsSchema>;

export type PublicWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
  createdAt: string;
  updatedAt: string;
};

export type PublicWorkspaceMember = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: string;
};
