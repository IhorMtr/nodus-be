import type { Request, RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { searchService } from './search.service.js';
import type {
  MessageSearchPage,
  SearchParams,
  SearchQuery,
} from './search.types.js';

// ==================== AUTH CONTEXT ====================

function authenticatedUserId(req: Request): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== PUBLIC API ====================

export const searchMessages: RequestHandler<
  SearchParams,
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
