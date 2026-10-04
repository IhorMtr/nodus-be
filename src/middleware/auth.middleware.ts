import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import type { AuthContext } from '../modules/auth/auth.types.js';
import { AppError } from '../shared/errors/app-error.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const authorization = req.get('Authorization');
  const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i);
  const token = match?.[1];
  if (!token) {
    next(new AppError('Access token is required', 401, 'Unauthorized'));
    return;
  }

  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
