import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { openApiDocument } from '../config/openapi.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { successResponse } from '../shared/utils/api-response.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json(successResponse({ status: 'ok' }));
});

router.use('/auth', authRouter);

router.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'Nodus API documentation',
    swaggerOptions: { validatorUrl: null },
  }),
);
