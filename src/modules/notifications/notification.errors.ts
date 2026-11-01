import { AppError } from '../../shared/errors/app-error.js';

// ==================== ERRORS ====================

export const notificationErrors = {
  notFound: () =>
    new AppError('Notification not found', 404, 'NotificationNotFound'),
};
