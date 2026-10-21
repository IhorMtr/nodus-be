import { AppError } from '../../shared/errors/app-error.js';
import { userRepository } from './user.repository.js';
import type { PublicUser } from './user.types.js';

async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findCurrentUser(userId);
  if (!user) throw new AppError('User not found', 404, 'UserNotFound');
  return user;
}

export const userService = {
  getCurrentUser,
};
