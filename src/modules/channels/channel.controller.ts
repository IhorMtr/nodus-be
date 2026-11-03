import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { channelService } from './channel.service.js';
import { channelReadStateService } from './channel-read-state.service.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import { socketPublisher } from '../../socket/socket.publisher.js';
import { channelReadStateRepository } from './channel-read-state.repository.js';
import type {
  ChannelParams,
  ChannelWorkspaceParams,
  CreateChannelInput,
  MarkChannelReadInput,
  PublicChannel,
  PublicChannelReadState,
  PublicChannelWithUnread,
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
  const state = await channelReadStateService.markRead(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.body.lastReadMessageId
  );
  if (state.advanced) {
    const reader = await channelReadStateRepository.reader(
      authenticatedUserId(req)
    );
    if (reader) {
      const payload = {
        workspaceId: req.params.workspaceId,
        channelId: req.params.channelId,
        reader,
        lastReadMessageId: state.state.lastReadMessageId,
        lastReadCreatedAt: state.createdAt,
      };
      const recipientIds = await channelReadStateRepository.memberIds(
        req.params.workspaceId
      );
      if (recipientIds.includes(authenticatedUserId(req))) {
        socketPublisher.publishChannelRead(payload, recipientIds);
        void notificationBridge.publishDirect({
          kind: 'channel-read',
          payload,
          recipientIds,
        });
      }
    }
  }
  res.json(successResponse(state.state));
};
