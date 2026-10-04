import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../shared/errors/app-error.js';
import type { FieldErrors } from '../shared/types/api-response.js';

function validateRequest(schema: ZodType, target: 'body' | 'params'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path.join('.') || '_form';
        (errors[field] ??= []).push(issue.code === 'unrecognized_keys'
          ? `Unexpected fields in request ${target}`
          : issue.message);
      }
      next(new AppError('Request validation failed', 400, 'ValidationFailed', errors));
      return;
    }

    if (target === 'body') {
      req.body = result.data;
    } else {
      Object.assign(req.params, result.data);
    }
    next();
  };
}

export function validateBody(schema: ZodType): RequestHandler {
  return validateRequest(schema, 'body');
}

export function validateParams(schema: ZodType): RequestHandler {
  return validateRequest(schema, 'params');
}
