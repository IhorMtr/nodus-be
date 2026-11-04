import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import { workspaceMetricsService } from './workspace-metrics.service.js';
import { workspaceService } from './workspace.service.js';
import type {
  CreateWorkspaceInput,
  PublicWorkspace,
  PublicWorkspaceMember,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
  WorkspaceMemberParams,
  WorkspaceMetrics,
  WorkspaceParams,
} from './workspace.types.js';

// ==================== REALTIME ====================

function revokeRealtimeAccess(
  workspaceId: string,
  userIds: string[]
): Promise<void> {
  return notificationBridge.broadcast({
    kind: 'workspace-revoked',
    workspaceId,
    userIds,
  });
}

// ==================== WORKSPACE LIFECYCLE ====================

export const createWorkspace: RequestHandler<
  ParamsDictionary,
  ApiResponse<PublicWorkspace>,
  CreateWorkspaceInput
> = async (req, res) => {
  const workspace = await workspaceService.createWorkspace(
    authenticatedUserId(req),
    req.body
  );
  res.status(201).json(successResponse(workspace));
};

export const listWorkspaces: RequestHandler<
  ParamsDictionary,
  ApiResponse<PublicWorkspace[]>
> = async (req, res) => {
  const workspaces = await workspaceService.listWorkspaces(
    authenticatedUserId(req)
  );
  res.json(successResponse(workspaces));
};

export const getWorkspace: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicWorkspace>
> = async (req, res) => {
  const workspace = await workspaceService.getWorkspace(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(workspace));
};

export const updateWorkspace: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicWorkspace>,
  UpdateWorkspaceInput
> = async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.body
  );
  res.json(successResponse(workspace));
};

export const deleteWorkspace: RequestHandler<
  WorkspaceParams,
  ApiResponse<null>
> = async (req, res) => {
  const formerMemberIds = await workspaceService.deleteWorkspace(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  await revokeRealtimeAccess(req.params.workspaceId, formerMemberIds);
  res.json(successResponse(null));
};

// ==================== MEMBERSHIP ====================

export const listMembers: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicWorkspaceMember[]>
> = async (req, res) => {
  const members = await workspaceService.listMembers(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(members));
};

export const updateMemberRole: RequestHandler<
  WorkspaceMemberParams,
  ApiResponse<PublicWorkspaceMember>,
  UpdateMemberRoleInput
> = async (req, res) => {
  const { member, notification } = await workspaceService.updateMemberRole(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.userId,
    req.body
  );
  if (notification) {
    void notificationBridge.broadcast({
      kind: 'notification-created',
      notification,
    });
  }
  res.json(successResponse(member));
};

export const removeMember: RequestHandler<
  WorkspaceMemberParams,
  ApiResponse<null>
> = async (req, res) => {
  const notification = await workspaceService.removeMember(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.userId
  );
  void notificationBridge.broadcast({
    kind: 'notification-created',
    notification,
  });
  await revokeRealtimeAccess(req.params.workspaceId, [req.params.userId]);
  res.json(successResponse(null));
};

// ==================== METRICS ====================

export const getWorkspaceMetrics: RequestHandler<
  WorkspaceParams,
  ApiResponse<WorkspaceMetrics>
> = async (req, res) => {
  const metrics = await workspaceMetricsService.get(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(metrics));
};
