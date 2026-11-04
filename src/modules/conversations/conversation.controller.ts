import type { RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import type { WorkspaceParams } from '../workspaces/workspace.types.js';
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
} from './conversation.types.js';

// ==================== CONVERSATIONS ====================

export const createConversation: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicConversation>,
  CreateConversationInput
> = async (req, res) => {
  const { conversation, created } = await conversationService.create(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.body.userId
  );
  res.status(created ? 201 : 200).json(successResponse(conversation));
};

export const listConversations: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicConversation[]>
> = async (req, res) => {
  const conversations = await conversationService.list(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(conversations));
};

// ==================== MESSAGES ====================

export const sendDirectMessage: RequestHandler<
  ConversationParams,
  ApiResponse<PublicDirectMessage>,
  DirectMessageInput
> = async (req, res) => {
  const { workspaceId } = req.params;
  const { message, notification } = await conversationService.sendMessage(
    workspaceId,
    authenticatedUserId(req),
    req.params.conversationId,
    req.body.content
  );
  void notificationBridge.broadcast({
    kind: 'direct-created',
    workspaceId,
    message,
  });
  void notificationBridge.broadcast({
    kind: 'notification-created',
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
  const history = await conversationService.history(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.conversationId,
    res.locals.validatedQuery
  );
  res.json(successResponse(history));
};

export const updateDirectMessage: RequestHandler<
  DirectMessageParams,
  ApiResponse<PublicDirectMessage>,
  DirectMessageInput
> = async (req, res) => {
  const { workspaceId } = req.params;
  const message = await conversationService.updateMessage(
    workspaceId,
    authenticatedUserId(req),
    req.params.conversationId,
    req.params.messageId,
    req.body.content
  );
  void notificationBridge.broadcast({
    kind: 'direct-updated',
    workspaceId,
    message,
  });
  res.json(successResponse(message));
};

export const deleteDirectMessage: RequestHandler<
  DirectMessageParams,
  ApiResponse<null>
> = async (req, res) => {
  const { workspaceId, conversationId, messageId } = req.params;
  await conversationService.deleteMessage(
    workspaceId,
    authenticatedUserId(req),
    conversationId,
    messageId
  );
  void notificationBridge.broadcast({
    kind: 'direct-deleted',
    workspaceId,
    conversationId,
    messageId,
  });
  res.json(successResponse(null));
};

// ==================== READ STATE ====================

export const markConversationRead: RequestHandler<
  ConversationParams,
  ApiResponse<PublicConversationReadState>,
  MarkConversationReadInput
> = async (req, res) => {
  const { state, receipt, notificationsRead } =
    await conversationService.markRead(
      req.params.workspaceId,
      authenticatedUserId(req),
      req.params.conversationId,
      req.body.lastReadMessageId
    );
  if (receipt) {
    void notificationBridge.broadcast({ kind: 'direct-read', ...receipt });
  }
  if (notificationsRead) {
    void notificationBridge.broadcast({
      kind: 'notifications-read',
      payload: notificationsRead,
    });
  }
  res.json(successResponse(state));
};
