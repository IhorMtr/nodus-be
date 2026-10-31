import type { Request, RequestHandler } from 'express';
import type { Query } from 'express-serve-static-core';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationService } from './notification.service.js';
import type {
  NotificationListQuery,
  NotificationPage,
  NotificationParams,
  PublicNotification,
} from './notification.types.js';

// ==================== AUTH CONTEXT ====================

function userId(req: Request): string {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

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
      await notificationService.list(userId(req), res.locals.validatedQuery)
    )
  );
};

export const getUnreadCount: RequestHandler = async (req, res) => {
  res.json(successResponse(await notificationService.unreadCount(userId(req))));
};

export const markNotificationRead: RequestHandler<
  NotificationParams,
  ApiResponse<PublicNotification>
> = async (req, res) => {
  res.json(
    successResponse(
      await notificationService.markRead(userId(req), req.params.notificationId)
    )
  );
};

export const markAllNotificationsRead: RequestHandler = async (req, res) => {
  res.json(successResponse(await notificationService.markAllRead(userId(req))));
};
