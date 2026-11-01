import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import { searchMessages } from './search.controller.js';
import { searchParamsSchema, searchQuerySchema } from './search.schema.js';

// ==================== ROUTES ====================

export const searchRouter = Router({ mergeParams: true });
searchRouter.use(authenticate);
searchRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
searchRouter.get(
  '/messages',
  validateParams(searchParamsSchema),
  validateQuery(searchQuerySchema),
  searchMessages
);
