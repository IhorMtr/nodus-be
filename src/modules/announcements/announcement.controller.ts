import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors/app-error.js';
import type { ApiResponse } from '../../shared/types/api-response.js';
import { successResponse } from '../../shared/utils/api-response.js';
import { announcementService } from './announcement.service.js';
import type {
  AnnouncementParams,
  AnnouncementWorkspaceParams,
  CreateAnnouncementInput,
  PublicAnnouncement,
  UpdateAnnouncementInput,
} from './announcement.types.js';

// ==================== AUTHENTICATION ====================

function userId(req: Request) {
  if (!req.auth)
    throw new AppError('Access token is required', 401, 'Unauthorized');
  return req.auth.userId;
}

// ==================== HANDLERS ====================

export const createAnnouncement: RequestHandler<
  AnnouncementWorkspaceParams,
  ApiResponse<PublicAnnouncement>,
  CreateAnnouncementInput
> = async (req, res) => {
  res
    .status(201)
    .json(
      successResponse(
        await announcementService.create(
          req.params.workspaceId,
          userId(req),
          req.body
        )
      )
    );
};

export const listAnnouncements: RequestHandler<
  AnnouncementWorkspaceParams,
  ApiResponse<PublicAnnouncement[]>
> = async (req, res) => {
  res.json(
    successResponse(
      await announcementService.list(req.params.workspaceId, userId(req))
    )
  );
};

export const getAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<PublicAnnouncement>
> = async (req, res) => {
  res.json(
    successResponse(
      await announcementService.get(
        req.params.workspaceId,
        userId(req),
        req.params.announcementId
      )
    )
  );
};

export const updateAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<PublicAnnouncement>,
  UpdateAnnouncementInput
> = async (req, res) => {
  res.json(
    successResponse(
      await announcementService.update(
        req.params.workspaceId,
        userId(req),
        req.params.announcementId,
        req.body
      )
    )
  );
};

export const deleteAnnouncement: RequestHandler<
  AnnouncementParams,
  ApiResponse<null>
> = async (req, res) => {
  await announcementService.remove(
    req.params.workspaceId,
    userId(req),
    req.params.announcementId
  );
  res.json(successResponse(null));
};
