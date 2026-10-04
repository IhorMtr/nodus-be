import type { RequestHandler } from 'express';

import { AppError } from '../shared/errors/app-error.js';

export const notFoundMiddleware: RequestHandler = (_req, _res, next) => {
  next(new AppError('Route not found', 404, 'NotFound'));
};
