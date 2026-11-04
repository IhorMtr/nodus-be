import type { RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationService } from './notification.service.js';
import type {
  NotificationListQuery,
  NotificationPage,
  NotificationParams,
  PublicNotification,
} from './notification.types.js';

// ==================== HANDLERS ====================

export const listNotifications: RequestHandler<
  Record<string, never>,
  ApiResponse<NotificationPage>,
  unknown,
  Query,
  { validatedQuery: NotificationListQuery }
> = async (req, res) => {
  res.json(
    successResponse(
      await notificationService.list(
        authenticatedUserId(req),
        res.locals.validatedQuery
      )
    )
  );
};

export const getUnreadCount: RequestHandler = async (req, res) => {
  res.json(
    successResponse(
      await notificationService.unreadCount(authenticatedUserId(req))
    )
  );
};

export const markNotificationRead: RequestHandler<
  NotificationParams,
  ApiResponse<PublicNotification>
> = async (req, res) => {
  res.json(
    successResponse(
      await notificationService.markRead(
        authenticatedUserId(req),
        req.params.notificationId
      )
    )
  );
};

export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  res.json(
    successResponse(
      await notificationService.markAllRead(authenticatedUserId(req))
    )
  );
};
