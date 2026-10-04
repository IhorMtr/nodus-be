import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
import type { FieldErrors } from '../shared/types/api-response.js';

export function validateBody(schema: ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || '_form';
        (errors[field] ??= []).push(issue.code === 'unrecognized_keys'
          ? 'Unexpected fields in request body'
          : issue.message);
      }
      next(new AppError('Request validation failed', 400, 'ValidationFailed', errors));
      return;
    }

    req.body = result.data;
    next();
  };
}
