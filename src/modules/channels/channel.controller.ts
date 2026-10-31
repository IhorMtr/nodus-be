import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { channelService } from './channel.service.js';
import type {
  ChannelParams,
  ChannelWorkspaceParams,
  CreateChannelInput,
  PublicChannel,
  UpdateChannelInput,
} from './channel.types.js';

// ==================== AUTH CONTEXT ====================

function authenticatedUserId(req: Request): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== CHANNEL LIFECYCLE ====================

export const createChannel: RequestHandler<
  ChannelWorkspaceParams,
  ApiResponse<PublicChannel>,
  CreateChannelInput
> = async (req, res) => {
  const channel = await channelService.createChannel(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.body
  );
  res.status(201).json(successResponse(channel));
};

export const listChannels: RequestHandler<
  ChannelWorkspaceParams,
  ApiResponse<PublicChannel[]>
> = async (req, res) => {
  const channels = await channelService.listChannels(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(channels));
};

export const getChannel: RequestHandler<
  ChannelParams,
  ApiResponse<PublicChannel>
> = async (req, res) => {
  const channel = await channelService.getChannel(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId
  );
  res.json(successResponse(channel));
};

export const updateChannel: RequestHandler<
  ChannelParams,
  ApiResponse<PublicChannel>,
  UpdateChannelInput
> = async (req, res) => {
  const channel = await channelService.updateChannel(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.body
  );
  res.json(successResponse(channel));
};

export const deleteChannel: RequestHandler<
  ChannelParams,
  ApiResponse<null>
> = async (req, res) => {
  await channelService.deleteChannel(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId
  );
  res.json(successResponse(null));
};
