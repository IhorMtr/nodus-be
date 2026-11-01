import { AppError } from '../../shared/errors/app-error.js';
import { presenceService } from '../presence/presence.service.js';
import { userRepository } from './user.repository.js';
import type { PublicUser } from './user.types.js';

// ==================== CURRENT USER ====================

async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await userRepository.findCurrentUser(userId);
  if (!user) throw new AppError('User not found', 404, 'UserNotFound');
  return user;
}

// ==================== PUBLIC API ====================

export const userService = {
  getCurrentUser,
  setStatus: (userId: string, status: 'online' | 'away' | 'dnd') =>
    presenceService.setStatus(userId, status),
};
