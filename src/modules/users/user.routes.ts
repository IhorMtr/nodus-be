import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { getCurrentUser, updateStatus } from './user.controller.js';
import { updateStatusSchema } from './user.schema.js';

// ==================== MIDDLEWARE ====================

export const userRouter = Router();

userRouter.use(authenticate);
userRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

userRouter.get('/me', getCurrentUser);
userRouter.patch('/me/status', validateBody(updateStatusSchema), updateStatus);
