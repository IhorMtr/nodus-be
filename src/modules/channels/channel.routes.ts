import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import {
  createChannel,
  deleteChannel,
  getChannel,
  listChannels,
  markChannelRead,
  updateChannel,
} from './channel.controller.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';
import {
  channelParamsSchema,
  createChannelSchema,
  markChannelReadSchema,
  updateChannelSchema,
} from './channel.schema.js';

// ==================== MIDDLEWARE ====================

export const channelRouter = Router({ mergeParams: true });

channelRouter.use(authenticate);
channelRouter.use(noStore);

// ==================== ROUTES ====================

channelRouter.post(
  '/',
  validateParams(workspaceParamsSchema),
  validateBody(createChannelSchema),
  createChannel
);
channelRouter.get('/', validateParams(workspaceParamsSchema), listChannels);
channelRouter.put(
  '/:channelId/read-state',
  validateParams(channelParamsSchema),
  validateBody(markChannelReadSchema),
  markChannelRead
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
