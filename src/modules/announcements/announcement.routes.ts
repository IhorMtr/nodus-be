import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from './announcement.controller.js';
import {
  announcementParamsSchema,
  announcementWorkspaceParamsSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcement.schema.js';

// ==================== MIDDLEWARE ====================

export const announcementRouter = Router({ mergeParams: true });
announcementRouter.use(authenticate);
announcementRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// ==================== ROUTES ====================

announcementRouter.post(
  '/',
  validateParams(announcementWorkspaceParamsSchema),
  validateBody(createAnnouncementSchema),
  createAnnouncement
);
announcementRouter.get(
  '/',
  validateParams(announcementWorkspaceParamsSchema),
  listAnnouncements
);
announcementRouter.get(
  '/:announcementId',
  validateParams(announcementParamsSchema),
  getAnnouncement
);
announcementRouter.patch(
  '/:announcementId',
  validateParams(announcementParamsSchema),
  validateBody(updateAnnouncementSchema),
  updateAnnouncement
);
announcementRouter.delete(
  '/:announcementId',
  validateParams(announcementParamsSchema),
  deleteAnnouncement
);
