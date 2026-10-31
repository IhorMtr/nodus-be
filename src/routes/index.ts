import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { asyncApiDocument } from '../config/asyncapi.js';
import { openApiDocument } from '../config/openapi.js';
import { env } from '../config/env.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { announcementRouter } from '../modules/announcements/announcement.routes.js';
import { channelRouter } from '../modules/channels/channel.routes.js';
import { messageRouter } from '../modules/messages/message.routes.js';
import {
  inviteRouter,
  workspaceInviteRouter,
} from '../modules/invites/invite.routes.js';
import { userRouter } from '../modules/users/user.routes.js';
import { notificationRouter } from '../modules/notifications/notification.routes.js';
import { workspaceRouter } from '../modules/workspaces/workspace.routes.js';
import { successResponse } from '../shared/utils/api-response.js';
import { asyncApiDocsRouter } from './async-docs.js';

// ==================== ROUTER AND HEALTH ====================

export const router = Router();

router.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'ok' }));
});

// ==================== API ROUTES ====================

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/notifications', notificationRouter);
router.use('/invites', inviteRouter);
router.use('/workspaces/:workspaceId/invites', workspaceInviteRouter);
router.use('/workspaces/:workspaceId/announcements', announcementRouter);
router.use(
  '/workspaces/:workspaceId/channels/:channelId/messages',
  messageRouter
);
router.use('/workspaces/:workspaceId/channels', channelRouter);
router.use('/workspaces', workspaceRouter);

// ==================== DEVELOPMENT DOCS ====================

if (env.NODE_ENV === 'development') {
  router.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Nodus API documentation',
      swaggerOptions: { validatorUrl: null },
    })
  );
  router.use('/api/async-docs', asyncApiDocsRouter);

  router.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  router.get('/api/asyncapi.json', (_req, res) => {
    res.json(asyncApiDocument);
  });
}
