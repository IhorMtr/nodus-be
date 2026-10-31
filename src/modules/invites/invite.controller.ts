import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { inviteService } from './invite.service.js';
import type {
  AcceptedInvite,
  CreatedInvite,
  InviteParams,
  InviteTokenInput,
  PublicInvite,
  ResolvedInvite,
} from './invite.types.js';
import type { WorkspaceParams } from '../workspaces/workspace.types.js';

// ==================== AUTHENTICATION ====================

function authenticatedUserId(req: Parameters<RequestHandler>[0]): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== HANDLERS ====================

export const createInvite: RequestHandler<
  WorkspaceParams,
  ApiResponse<CreatedInvite>
> = async (req, res) => {
  const invite = await inviteService.createInvite(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.status(201).json(successResponse(invite));
};

export const listInvites: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicInvite[]>
> = async (req, res) => {
  res.json(
    successResponse(
      await inviteService.listInvites(
        req.params.workspaceId,
        authenticatedUserId(req)
      )
    )
  );
};

export const resolveInvite: RequestHandler<
  ParamsDictionary,
  ApiResponse<ResolvedInvite>,
  InviteTokenInput
> = async (req, res) => {
  res.json(successResponse(await inviteService.resolveInvite(req.body.token)));
};

export const acceptInvite: RequestHandler<
  ParamsDictionary,
  ApiResponse<AcceptedInvite>,
  InviteTokenInput
> = async (req, res) => {
  res.json(
    successResponse(
      await inviteService.acceptInvite(req.body.token, authenticatedUserId(req))
    )
  );
};

export const revokeInvite: RequestHandler<
  InviteParams,
  ApiResponse<null>
> = async (req, res) => {
  await inviteService.revokeInvite(
    req.params.workspaceId,
    req.params.inviteId,
    authenticatedUserId(req)
  );
  res.json(successResponse(null));
};
