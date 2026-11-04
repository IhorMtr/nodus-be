import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import {
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  getWorkspaceMetrics,
  listMembers,
  listWorkspaces,
  removeMember,
  updateMemberRole,
  updateWorkspace,
} from './workspace.controller.js';
import {
  createWorkspaceSchema,
  updateMemberRoleSchema,
  updateWorkspaceSchema,
  workspaceMemberParamsSchema,
  workspaceParamsSchema,
} from './workspace.schema.js';

// ==================== MIDDLEWARE ====================

export const workspaceRouter = Router();

workspaceRouter.use(authenticate);
workspaceRouter.use(noStore);

// ==================== ROUTES ====================

workspaceRouter.post('/', validateBody(createWorkspaceSchema), createWorkspace);
workspaceRouter.get('/', listWorkspaces);
workspaceRouter.get(
  '/:workspaceId',
  validateParams(workspaceParamsSchema),
  getWorkspace
);
workspaceRouter.patch(
  '/:workspaceId',
  validateParams(workspaceParamsSchema),
  validateBody(updateWorkspaceSchema),
  updateWorkspace
);
workspaceRouter.delete(
  '/:workspaceId',
  validateParams(workspaceParamsSchema),
  deleteWorkspace
);
workspaceRouter.get(
  '/:workspaceId/members',
  validateParams(workspaceParamsSchema),
  listMembers
);
workspaceRouter.patch(
  '/:workspaceId/members/:userId/role',
  validateParams(workspaceMemberParamsSchema),
  validateBody(updateMemberRoleSchema),
  updateMemberRole
);
workspaceRouter.delete(
  '/:workspaceId/members/:userId',
  validateParams(workspaceMemberParamsSchema),
  removeMember
);
workspaceRouter.get(
  '/:workspaceId/metrics',
  validateParams(workspaceParamsSchema),
  getWorkspaceMetrics
);
