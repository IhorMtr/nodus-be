import { prisma } from '../../database/client.js';
import { isPrismaError } from '../../database/errors.js';
import type { PresencePreference } from '../../generated/prisma/client.js';

// ==================== QUERIES ====================

function findPreference(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { presencePreference: true },
  });
}

function findPreferences(userIds: string[]) {
  return prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, presencePreference: true },
  });
}

async function findVisibleUserIds(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT viewer."userId"
    FROM "WorkspaceMember" actor
    JOIN "WorkspaceMember" viewer ON viewer."workspaceId" = actor."workspaceId"
    WHERE actor."userId" = ${userId}::uuid
  `;
  return rows.map(row => row.userId);
}

// ==================== MUTATIONS ====================

async function setPreference(
  userId: string,
  presencePreference: PresencePreference
) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { presencePreference },
      select: { presencePreference: true },
    });
  } catch (error) {
    if (isPrismaError(error, 'recordNotFound')) {
      return null;
    }
    throw error;
  }
}

// ==================== PUBLIC API ====================

export const presenceRepository = {
  findPreference,
  findPreferences,
  findVisibleUserIds,
  setPreference,
};
