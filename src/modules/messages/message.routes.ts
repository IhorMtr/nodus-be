import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  createMessage,
  deleteMessage,
  listMessages,
  updateMessage,
} from './message.controller.js';
import {
  createMessageSchema,
  messageChannelParamsSchema,
  messageHistoryQuerySchema,
  messageParamsSchema,
  updateMessageSchema,
} from './message.schema.js';

// ==================== MIDDLEWARE ====================

export const messageRouter = Router({ mergeParams: true });

messageRouter.use(authenticate);
messageRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==================== ROUTES ====================

messageRouter.post(
  '/',
  validateParams(messageChannelParamsSchema),
  validateBody(createMessageSchema),
  createMessage
);
messageRouter.get(
  '/',
  validateParams(messageChannelParamsSchema),
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
