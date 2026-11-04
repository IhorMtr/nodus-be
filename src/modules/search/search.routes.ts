import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import { searchMessages } from './search.controller.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';
import { searchQuerySchema } from './search.schema.js';

// ==================== ROUTES ====================

export const searchRouter = Router({ mergeParams: true });
searchRouter.use(authenticate);
searchRouter.use(noStore);
searchRouter.get(
  '/messages',
  validateParams(workspaceParamsSchema),
  validateQuery(searchQuerySchema),
  searchMessages
);
