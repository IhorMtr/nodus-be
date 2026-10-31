import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import {
  createChannel,
  deleteChannel,
  getChannel,
  listChannels,
  updateChannel,
} from './channel.controller.js';
import {
  channelParamsSchema,
  channelWorkspaceParamsSchema,
  createChannelSchema,
  updateChannelSchema,
} from './channel.schema.js';

// ==================== MIDDLEWARE ====================

export const channelRouter = Router({ mergeParams: true });

channelRouter.use(authenticate);
channelRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ==================== ROUTES ====================

channelRouter.post(
  '/',
  validateParams(channelWorkspaceParamsSchema),
  validateBody(createChannelSchema),
  createChannel
);
channelRouter.get(
  '/',
  validateParams(channelWorkspaceParamsSchema),
  listChannels
);
channelRouter.get(
  '/:channelId',
  validateParams(channelParamsSchema),
  getChannel
);
channelRouter.patch(
  '/:channelId',
  validateParams(channelParamsSchema),
  validateBody(updateChannelSchema),
  updateChannel
);
channelRouter.delete(
  '/:channelId',
  validateParams(channelParamsSchema),
  deleteChannel
);
