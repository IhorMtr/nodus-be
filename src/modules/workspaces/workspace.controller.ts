import type { Request, RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { workspaceService } from './workspace.service.js';
import type {
  CreateWorkspaceInput,
  PublicWorkspace,
  PublicWorkspaceMember,
  UpdateMemberRoleInput,
  UpdateWorkspaceInput,
  WorkspaceMemberParams,
  WorkspaceParams,
} from './workspace.types.js';

// ==================== AUTH CONTEXT ====================

function authenticatedUserId(req: Request): string {
  if (!req.auth) throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== WORKSPACE LIFECYCLE ====================

export const createWorkspace: RequestHandler<ParamsDictionary, ApiResponse<PublicWorkspace>, CreateWorkspaceInput> = async (req, res) => {
  const workspace = await workspaceService.createWorkspace(authenticatedUserId(req), req.body);
  res.status(201).json(successResponse(workspace));
};

export const listWorkspaces: RequestHandler<ParamsDictionary, ApiResponse<PublicWorkspace[]>> = async (req, res) => {
  const workspaces = await workspaceService.listWorkspaces(authenticatedUserId(req));
  res.json(successResponse(workspaces));
};

export const getWorkspace: RequestHandler<WorkspaceParams, ApiResponse<PublicWorkspace>> = async (req, res) => {
  const workspace = await workspaceService.getWorkspace(req.params.workspaceId, authenticatedUserId(req));
  res.json(successResponse(workspace));
};

export const updateWorkspace: RequestHandler<WorkspaceParams, ApiResponse<PublicWorkspace>, UpdateWorkspaceInput> = async (req, res) => {
  const workspace = await workspaceService.updateWorkspace(req.params.workspaceId, authenticatedUserId(req), req.body);
  res.json(successResponse(workspace));
};

export const deleteWorkspace: RequestHandler<WorkspaceParams, ApiResponse<null>> = async (req, res) => {
  await workspaceService.deleteWorkspace(req.params.workspaceId, authenticatedUserId(req));
  res.json(successResponse(null));
};

// ==================== MEMBERSHIP ====================

export const listMembers: RequestHandler<WorkspaceParams, ApiResponse<PublicWorkspaceMember[]>> = async (req, res) => {
  const members = await workspaceService.listMembers(req.params.workspaceId, authenticatedUserId(req));
  res.json(successResponse(members));
};

export const updateMemberRole: RequestHandler<WorkspaceMemberParams, ApiResponse<PublicWorkspaceMember>, UpdateMemberRoleInput> = async (req, res) => {
  const member = await workspaceService.updateMemberRole(req.params.workspaceId, authenticatedUserId(req), req.params.userId, req.body);
  res.json(successResponse(member));
};

export const removeMember: RequestHandler<WorkspaceMemberParams, ApiResponse<null>> = async (req, res) => {
  await workspaceService.removeMember(req.params.workspaceId, authenticatedUserId(req), req.params.userId);
  res.json(successResponse(null));
};
