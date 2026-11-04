import type { RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import type { ChannelParams } from '../channels/channel.types.js';
import { messageService } from './message.service.js';
import type {
  CreateMessageInput,
  MessageContext,
  MessageHistory,
  MessageHistoryQuery,
  MessageParams,
  PublicMessage,
  UpdateMessageInput,
} from './message.types.js';

// ==================== QUERIES ====================

export const listMessages: RequestHandler<
  ChannelParams,
  ApiResponse<MessageHistory>,
  unknown,
  Query,
  { validatedQuery: MessageHistoryQuery }
> = async (req, res) => {
  const history = await messageService.listMessages(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    res.locals.validatedQuery
  );
  res.json(successResponse(history));
};

export const getMessageContext: RequestHandler<
  MessageParams,
  ApiResponse<MessageContext>
> = async (req, res) => {
  const context = await messageService.getMessageContext(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.params.messageId
  );
  res.json(successResponse(context));
};

// ==================== MUTATIONS ====================

export const createMessage: RequestHandler<
  ChannelParams,
  ApiResponse<PublicMessage>,
  CreateMessageInput
> = async (req, res) => {
  const { workspaceId } = req.params;
  const message = await messageService.createMessage(
    workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.body
  );
  void notificationBridge.broadcast({
    kind: 'message-created',
    workspaceId,
    message,
  });
  res.status(201).json(successResponse(message));
};

export const updateMessage: RequestHandler<
  MessageParams,
  ApiResponse<PublicMessage>,
  UpdateMessageInput
> = async (req, res) => {
  const { workspaceId } = req.params;
  const message = await messageService.updateMessage(
    workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.params.messageId,
    req.body
  );
  void notificationBridge.broadcast({
    kind: 'message-updated',
    workspaceId,
    message,
  });
  res.json(successResponse(message));
};

export const deleteMessage: RequestHandler<
  MessageParams,
  ApiResponse<null>
> = async (req, res) => {
  const { workspaceId, channelId, messageId } = req.params;
  await messageService.deleteMessage(
    workspaceId,
    authenticatedUserId(req),
    channelId,
    messageId
  );
  void notificationBridge.broadcast({
    kind: 'message-deleted',
    workspaceId,
    channelId,
    messageId,
  });
  res.json(successResponse(null));
};
