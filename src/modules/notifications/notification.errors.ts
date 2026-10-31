import { AppError } from '../../shared/errors/app-error.js';

export const notificationErrors = {
  notFound: () =>
    new AppError('Notification not found', 404, 'NotificationNotFound'),
};
