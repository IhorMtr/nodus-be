import type { ErrorRequestHandler } from 'express';

import { AppError } from '../shared/errors/app-error.js';
import { errorResponse } from '../shared/utils/api-response.js';

export const errorMiddleware: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      req.log.error({ err: error }, 'Request failed');
    }

    res.status(error.statusCode).json(errorResponse(error.code, error.fieldErrors));
    return;
  }

  if (error instanceof Error && 'type' in error && 'status' in error) {
    if (
      error instanceof SyntaxError &&
      error.type === 'entity.parse.failed' &&
      error.status === 400
    ) {
      res.status(400).json(errorResponse('InvalidJson'));
      return;
    }

    if (error.type === 'entity.too.large' && error.status === 413) {
      res.status(413).json(errorResponse('PayloadTooLarge'));
      return;
    }

    if ((error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') && error.status === 415) {
      res.status(415).json(errorResponse('UnsupportedMediaType'));
      return;
    }
  }

  req.log.error({ err: error }, 'Unexpected request error');
  res.status(500).json(errorResponse('InternalError'));
};
