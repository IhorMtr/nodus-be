import { AppError } from '../../shared/errors/app-error.js';

export const channelErrors = {
  notFound: () => new AppError('Channel not found', 404, 'ChannelNotFound'),
  nameAlreadyExists: () => new AppError('A channel with this name already exists in the workspace', 409, 'ChannelNameAlreadyExists'),
};
