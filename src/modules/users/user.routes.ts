import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { getCurrentUser } from './user.controller.js';

export const userRouter = Router();

userRouter.use(authenticate);
userRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

userRouter.get('/me', getCurrentUser);
