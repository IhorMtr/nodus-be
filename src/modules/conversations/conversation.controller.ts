import type { Request, RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { socketPublisher } from '../../socket/socket.publisher.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import { conversationService } from './conversation.service.js';
import type {
  ConversationParams,
  CreateConversationInput,
  DirectHistory,
  DirectHistoryQuery,
  DirectMessageInput,
  DirectMessageParams,
  MarkConversationReadInput,
  PublicConversation,
  PublicConversationReadState,
  PublicDirectMessage,
  WorkspaceParams,
} from './conversation.types.js';

// ==================== AUTH CONTEXT ====================

function userId(req: Request): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== CONVERSATIONS ====================

export const createConversation: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicConversation>,
  CreateConversationInput
> = async (req, res) => {
  const { conversation, created } = await conversationService.create(
    req.params.workspaceId,
    userId(req),
    req.body.userId
  );
  res.status(created ? 201 : 200).json(successResponse(conversation));
};

export const listConversations: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicConversation[]>
> = async (req, res) => {
  res.json(
    successResponse(
      await conversationService.list(req.params.workspaceId, userId(req))
    )
  );
};

// ==================== MESSAGES ====================

export const sendDirectMessage: RequestHandler<
  ConversationParams,
  ApiResponse<PublicDirectMessage>,
  DirectMessageInput
> = async (req, res) => {
  const { message, notification } = await conversationService.sendMessage(
    req.params.workspaceId,
    userId(req),
    req.params.conversationId,
    req.body.content
  );
  socketPublisher.publishDirectMessageCreated(req.params.workspaceId, message);
  socketPublisher.publishNotificationCreated(notification);
  void notificationBridge.publishDirect({
    kind: 'direct-created',
    workspaceId: req.params.workspaceId,
    message,
  });
  void notificationBridge.publishDirect({
    kind: 'direct-notification',
    notification,
  });
  res.status(201).json(successResponse(message));
};

export const listDirectMessages: RequestHandler<
  ConversationParams,
  ApiResponse<DirectHistory>,
  unknown,
  Query,
  { validatedQuery: DirectHistoryQuery }
> = async (req, res) => {
  res.json(
    successResponse(
      await conversationService.history(
        req.params.workspaceId,
        userId(req),
        req.params.conversationId,
        res.locals.validatedQuery
      )
    )
  );
};

export const updateDirectMessage: RequestHandler<
  DirectMessageParams,
  ApiResponse<PublicDirectMessage>,
  DirectMessageInput
> = async (req, res) => {
  const message = await conversationService.updateMessage(
    req.params.workspaceId,
    userId(req),
    req.params.conversationId,
    req.params.messageId,
    req.body.content
  );
  socketPublisher.publishDirectMessageUpdated(req.params.workspaceId, message);
  void notificationBridge.publishDirect({
    kind: 'direct-updated',
    workspaceId: req.params.workspaceId,
    message,
  });
  res.json(successResponse(message));
};

export const deleteDirectMessage: RequestHandler<
  DirectMessageParams,
  ApiResponse<null>
> = async (req, res) => {
  await conversationService.deleteMessage(
    req.params.workspaceId,
    userId(req),
    req.params.conversationId,
    req.params.messageId
  );
  socketPublisher.publishDirectMessageDeleted(
    req.params.workspaceId,
    req.params.conversationId,
    req.params.messageId
  );
  void notificationBridge.publishDirect({
    kind: 'direct-deleted',
    workspaceId: req.params.workspaceId,
    conversationId: req.params.conversationId,
    messageId: req.params.messageId,
  });
  res.json(successResponse(null));
};

// ==================== READ STATE ====================

export const markConversationRead: RequestHandler<
  ConversationParams,
  ApiResponse<PublicConversationReadState>,
  MarkConversationReadInput
> = async (req, res) => {
  res.json(
    successResponse(
      await conversationService.markRead(
        req.params.workspaceId,
        userId(req),
        req.params.conversationId,
        req.body.lastReadMessageId
      )
    )
  );
};
