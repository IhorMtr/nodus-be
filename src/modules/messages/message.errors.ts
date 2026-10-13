import { AppError } from '../../shared/errors/app-error.js';

export const messageErrors = {
  notFound: () => new AppError('Message not found', 404, 'MessageNotFound'),
  editForbidden: () => new AppError('Only the author can edit a message', 403, 'MessageEditForbidden'),
  deleteForbidden: () => new AppError('Only the author, Owner, or Admin can delete a message', 403, 'MessageDeleteForbidden'),
};
