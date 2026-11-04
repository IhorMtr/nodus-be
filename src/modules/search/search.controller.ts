import type { RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import type { WorkspaceParams } from '../workspaces/workspace.types.js';
import { searchService } from './search.service.js';
import type { MessageSearchPage, SearchQuery } from './search.types.js';

// ==================== HANDLERS ====================

export const searchMessages: RequestHandler<
  WorkspaceParams,
  ApiResponse<MessageSearchPage>,
  unknown,
  Query,
  { validatedQuery: SearchQuery }
> = async (req, res) => {
  const page = await searchService.searchMessages(
    req.params.workspaceId,
    authenticatedUserId(req),
    res.locals.validatedQuery
  );
  res.json(successResponse(page));
};
