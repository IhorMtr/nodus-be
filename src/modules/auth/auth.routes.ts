import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { validateBody } from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  LOGIN_LIMIT,
  LOGIN_WINDOW_MS,
  REGISTER_LIMIT,
  REGISTER_WINDOW_MS,
} from './auth.constants.js';
import { login, logout, refresh, register } from './auth.controller.js';
import {
  loginSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.schema.js';

// ==================== RATE LIMITS ====================

function rateLimiter(windowMs: number, limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError('Too many requests', 429, 'TooManyRequests')),
  });
}

const registerRateLimiter = rateLimiter(REGISTER_WINDOW_MS, REGISTER_LIMIT);
const loginRateLimiter = rateLimiter(LOGIN_WINDOW_MS, LOGIN_LIMIT);

// ==================== ROUTES ====================

export const authRouter = Router();

authRouter.use(noStore);
authRouter.post(
  '/register',
  registerRateLimiter,
  validateBody(registerSchema),
  register
);
authRouter.post('/login', loginRateLimiter, validateBody(loginSchema), login);
authRouter.post('/refresh', validateBody(refreshTokenSchema), refresh);
authRouter.post('/logout', validateBody(refreshTokenSchema), logout);
