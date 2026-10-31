import type { Request, RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { logger } from '../../config/logger.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { socketPublisher } from '../../socket/socket.publisher.js';
import { messageService } from './message.service.js';
import type {
  CreateMessageInput,
  MessageChannelParams,
  MessageHistory,
  MessageHistoryQuery,
  MessageParams,
  PublicMessage,
  UpdateMessageInput,
} from './message.types.js';

// ==================== AUTH CONTEXT ====================

function authenticatedUserId(req: Request): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== MESSAGE LIFECYCLE ====================

export const createMessage: RequestHandler<
  MessageChannelParams,
  ApiResponse<PublicMessage>,
  CreateMessageInput
> = async (req, res) => {
  const message = await messageService.createMessage(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.body
  );
  logger.info(
    {
      workspaceId: req.params.workspaceId,
      channelId: req.params.channelId,
      messageId: message.id,
    },
    'Message created, invoking realtime publisher'
  );
  socketPublisher.publishMessageCreated(req.params.workspaceId, message);
  res.status(201).json(successResponse(message));
};

export const listMessages: RequestHandler<
  MessageChannelParams,
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

export const updateMessage: RequestHandler<
  MessageParams,
  ApiResponse<PublicMessage>,
  UpdateMessageInput
> = async (req, res) => {
  const message = await messageService.updateMessage(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.params.messageId,
    req.body
  );
  socketPublisher.publishMessageUpdated(req.params.workspaceId, message);
  res.json(successResponse(message));
};

export const deleteMessage: RequestHandler<
  MessageParams,
  ApiResponse<null>
> = async (req, res) => {
  await messageService.deleteMessage(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.channelId,
    req.params.messageId
  );
  socketPublisher.publishMessageDeleted(
    req.params.workspaceId,
    req.params.channelId,
    req.params.messageId
  );
  res.json(successResponse(null));
};
