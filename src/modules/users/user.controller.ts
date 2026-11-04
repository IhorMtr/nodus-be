import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import type { PresenceUpdate } from '../presence/presence.service.js';
import { userService } from './user.service.js';
import type { PublicUser, UpdateStatusInput } from './user.types.js';

// ==================== CURRENT USER ====================

export const getCurrentUser: RequestHandler<
  ParamsDictionary,
  ApiResponse<PublicUser>
> = async (req, res) => {
  const user = await userService.getCurrentUser(authenticatedUserId(req));
  res.json(successResponse(user));
};

// ==================== STATUS ====================

export const updateStatus: RequestHandler<
  ParamsDictionary,
  ApiResponse<PresenceUpdate>,
  UpdateStatusInput
> = async (req, res) => {
  const status = await userService.setStatus(
    authenticatedUserId(req),
    req.body.status
  );
  res.json(successResponse(status));
};
