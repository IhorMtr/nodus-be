import type { RequestHandler } from 'express';
import { authenticatedUserId } from '../../middleware/auth.middleware.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { notificationBridge } from '../../socket/notification.bridge.js';
import type { PublicNotification } from '../notifications/notification.types.js';
import type { WorkspaceParams } from '../workspaces/workspace.types.js';
import { announcementService } from './announcement.service.js';
import type {
  AnnouncementParams,
  CreateAnnouncementInput,
  PublicAnnouncement,
  UpdateAnnouncementInput,
} from './announcement.types.js';

// ==================== REALTIME ====================

function broadcastNotifications(notifications: PublicNotification[]): void {
  for (const notification of notifications) {
    void notificationBridge.broadcast({
      kind: 'notification-created',
      notification,
    });
  }
}

// ==================== HANDLERS ====================

export const createAnnouncement: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicAnnouncement>,
  CreateAnnouncementInput
> = async (req, res) => {
  const { announcement, notifications } = await announcementService.create(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.body
  );
  broadcastNotifications(notifications);
  res.status(201).json(successResponse(announcement));
};

export const listAnnouncements: RequestHandler<
  WorkspaceParams,
  ApiResponse<PublicAnnouncement[]>
> = async (req, res) => {
  const announcements = await announcementService.list(
    req.params.workspaceId,
    authenticatedUserId(req)
  );
  res.json(successResponse(announcements));
};

export const getAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<PublicAnnouncement>
> = async (req, res) => {
  const announcement = await announcementService.get(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.announcementId
  );
  res.json(successResponse(announcement));
};

export const updateAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<PublicAnnouncement>,
  UpdateAnnouncementInput
> = async (req, res) => {
  const { announcement, notifications } = await announcementService.update(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.announcementId,
    req.body
  );
  broadcastNotifications(notifications);
  res.json(successResponse(announcement));
};

export const deleteAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<null>
> = async (req, res) => {
  await announcementService.remove(
    req.params.workspaceId,
    authenticatedUserId(req),
    req.params.announcementId
  );
  res.json(successResponse(null));
};
