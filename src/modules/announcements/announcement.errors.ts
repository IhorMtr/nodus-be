import { AppError } from '../../shared/errors/app-error.js';

export const announcementErrors = {
  notFound: () =>
    new AppError('Announcement not found', 404, 'AnnouncementNotFound'),
  invalidPublishAt: () =>
    new AppError('publishAt must be in the future', 400, 'InvalidPublishAt'),
  alreadyPublished: () =>
    new AppError(
      'A published announcement cannot be scheduled again',
      409,
      'AnnouncementAlreadyPublished'
    ),
  conflict: () =>
    new AppError(
      'Announcement changed concurrently; retry the request',
      409,
      'AnnouncementConflict'
    ),
};
