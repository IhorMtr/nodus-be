import type { RequestHandler } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { z } from 'zod';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import type { refreshTokenSchema } from './auth.schema.js';
import { authService } from './auth.service.js';
import type { AuthTokens, LoginInput, RegisterInput } from './auth.types.js';

type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const register: RequestHandler<ParamsDictionary, ApiResponse<AuthTokens>, RegisterInput> = async (req, res) => {
  const tokens = await authService.register(req.body);
  res.status(201).json(successResponse(tokens));
};

export const login: RequestHandler<ParamsDictionary, ApiResponse<AuthTokens>, LoginInput> = async (req, res) => {
  const tokens = await authService.login(req.body);
  res.json(successResponse(tokens));
};

export const refresh: RequestHandler<ParamsDictionary, ApiResponse<AuthTokens>, RefreshTokenInput> = async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  res.json(successResponse(tokens));
};

export const logout: RequestHandler<ParamsDictionary, ApiResponse<null>, RefreshTokenInput> = async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.json(successResponse(null));
};
