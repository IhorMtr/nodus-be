import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { userService } from './user.service.js';
import type { PublicUser } from './user.types.js';

export const getCurrentUser: RequestHandler<
  ParamsDictionary,
  ApiResponse<PublicUser>
> = async (req, res) => {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  const user = await userService.getCurrentUser(req.auth.userId);
  res.json(successResponse(user));
};
