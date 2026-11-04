import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import {
  createMessage,
  deleteMessage,
  getMessageContext,
  listMessages,
  updateMessage,
} from './message.controller.js';
import { channelParamsSchema } from '../channels/channel.schema.js';
import {
  createMessageSchema,
  messageHistoryQuerySchema,
  messageParamsSchema,
  updateMessageSchema,
} from './message.schema.js';

// ==================== MIDDLEWARE ====================

export const messageRouter = Router({ mergeParams: true });

messageRouter.use(authenticate);
messageRouter.use(noStore);

// ==================== ROUTES ====================

messageRouter.post(
  '/',
  validateParams(channelParamsSchema),
  validateBody(createMessageSchema),
  createMessage
);
messageRouter.get(
  '/:messageId/context',
  validateParams(messageParamsSchema),
  getMessageContext
);
messageRouter.get(
  '/',
  validateParams(channelParamsSchema),
  validateQuery(messageHistoryQuerySchema),
  listMessages
);
messageRouter.patch(
  '/:messageId',
  validateParams(messageParamsSchema),
  validateBody(updateMessageSchema),
  updateMessage
);
messageRouter.delete(
  '/:messageId',
  validateParams(messageParamsSchema),
  deleteMessage
);
