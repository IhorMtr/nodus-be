import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import { getCurrentUser, updateStatus } from './user.controller.js';
import { updateStatusSchema } from './user.schema.js';

// ==================== MIDDLEWARE ====================

export const userRouter = Router();

userRouter.use(authenticate);
userRouter.use(noStore);

userRouter.get('/me', getCurrentUser);
userRouter.patch('/me/status', validateBody(updateStatusSchema), updateStatus);
