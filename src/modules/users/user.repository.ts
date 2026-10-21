import { prisma } from '../../database/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from './user.types.js';

// ==================== SELECTS ====================

const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.UserSelect;

// ==================== DATABASE ACCESS ====================

function findCurrentUser(userId: string): Promise<PublicUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });
}

export const userRepository = {
  findCurrentUser,
};
