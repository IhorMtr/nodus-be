import type { RequestHandler } from 'express';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import type { WorkspaceParams } from '../workspaces/workspace.types.js';
import { channelReadStateService } from './channel-read-state.service.js';
import { channelService } from './channel.service.js';
import type {
  ChannelParams,
  CreateChannelInput,
  MarkChannelReadInput,
  PublicChannel,
  PublicChannelReadState,
  PublicChannelWithUnread,
  UpdateChannelInput,
} from './channel.types.js';

// ==================== CHANNEL LIFECYCLE ====================

export const createChannel: RequestHandler<
  WorkspaceParams,
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
  WorkspaceParams,
  ApiResponse<PublicChannelWithUnread[]>
> = async (req, res) => {
  const channels = await channelService.listChannels(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(channels));
};

export const getChannel: RequestHandler<
  ChannelParams,
  ApiResponse<PublicChannelWithUnread>
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

// ==================== READ STATE ====================

export const markChannelRead: RequestHandler<
  ChannelParams,
  ApiResponse<PublicChannelReadState>,
  MarkChannelReadInput
> = async (req, res) => {
  const { state, receipt } = await channelReadStateService.markRead(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.body.lastReadMessageId
  );
  if (receipt) {
    void notificationBridge.broadcast({ kind: 'channel-read', ...receipt });
  }
  res.json(successResponse(state));
};
