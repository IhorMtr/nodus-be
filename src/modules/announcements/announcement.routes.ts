import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  validateBody,
  validateParams,
} from '../../middleware/validation.middleware.js';
import { noStore } from '../../middleware/no-store.middleware.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from './announcement.controller.js';
import { workspaceParamsSchema } from '../workspaces/workspace.schema.js';
import {
  announcementParamsSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcement.schema.js';

// ==================== MIDDLEWARE ====================

export const announcementRouter = Router({ mergeParams: true });
announcementRouter.use(authenticate);
announcementRouter.use(noStore);

// ==================== ROUTES ====================

announcementRouter.post(
  '/',
  validateParams(workspaceParamsSchema),
  validateBody(createAnnouncementSchema),
  createAnnouncement
);
announcementRouter.get(
  '/',
  validateParams(workspaceParamsSchema),
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
