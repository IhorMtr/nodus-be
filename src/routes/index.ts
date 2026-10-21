import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from '../config/openapi.js';
import { env } from '../config/env.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { channelRouter } from '../modules/channels/channel.routes.js';
import { messageRouter } from '../modules/messages/message.routes.js';
import { userRouter } from '../modules/users/user.routes.js';
import { workspaceRouter } from '../modules/workspaces/workspace.routes.js';
import { successResponse } from '../shared/utils/api-response.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'ok' }));
});

router.get('/api/openapi.json', (_req, res) => {
  res.json(openApiDocument);
});

router.use('/auth', authRouter);
router.use('/users', userRouter);
router.use('/workspaces/:workspaceId/channels/:channelId/messages', messageRouter);
router.use('/workspaces/:workspaceId/channels', channelRouter);
router.use('/workspaces', workspaceRouter);

if (env.NODE_ENV === 'development') {
  router.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Nodus API documentation',
      swaggerOptions: { validatorUrl: null },
    }),
  );
}
