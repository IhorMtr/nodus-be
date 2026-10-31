import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateParams,
  validateQuery,
} from '../../middleware/validation.middleware.js';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notification.controller.js';
import {
  notificationListQuerySchema,
  notificationParamsSchema,
} from './notification.schema.js';

// ==================== ROUTES ====================

export const notificationRouter = Router();
notificationRouter.use(authenticate);
notificationRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
notificationRouter.get(
  '/',
  validateQuery(notificationListQuerySchema),
  listNotifications
);
notificationRouter.get('/unread-count', getUnreadCount);
notificationRouter.patch(
  '/:notificationId/read',
  validateParams(notificationParamsSchema),
  markNotificationRead
);
notificationRouter.post('/read-all', markAllNotificationsRead);
