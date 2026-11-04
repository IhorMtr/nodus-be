import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import {
  createConversation,
  deleteDirectMessage,
  listConversations,
  listDirectMessages,
  markConversationRead,
  sendDirectMessage,
  updateDirectMessage,
} from './conversation.controller.js';
import {
  conversationParamsSchema,
  createConversationSchema,
  directHistorySchema,
  directMessageParamsSchema,
  directMessageSchema,
  markConversationReadSchema,
} from './conversation.schema.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';

// ==================== ROUTER ====================

export const conversationRouter = Router({ mergeParams: true });
conversationRouter.use(authenticate);
conversationRouter.use(noStore);

// ==================== ROUTES ====================

conversationRouter.post(
  '/',
  validateParams(workspaceParamsSchema),
  validateBody(createConversationSchema),
  createConversation
);
conversationRouter.get(
  '/',
  validateParams(workspaceParamsSchema),
  listConversations
);
conversationRouter.put(
  '/:conversationId/read-state',
  validateParams(conversationParamsSchema),
  validateBody(markConversationReadSchema),
  markConversationRead
);
conversationRouter.get(
  '/:conversationId/messages',
  validateParams(conversationParamsSchema),
  validateQuery(directHistorySchema),
  listDirectMessages
);
conversationRouter.post(
  '/:conversationId/messages',
  validateParams(conversationParamsSchema),
  validateBody(directMessageSchema),
  sendDirectMessage
);
conversationRouter.patch(
  '/:conversationId/messages/:messageId',
  validateParams(directMessageParamsSchema),
  validateBody(directMessageSchema),
  updateDirectMessage
);
conversationRouter.delete(
  '/:conversationId/messages/:messageId',
  validateParams(directMessageParamsSchema),
  deleteDirectMessage
);
