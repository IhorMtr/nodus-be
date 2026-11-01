import { prisma } from '../../database/client.js';
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

function setPreference(userId: string, presencePreference: PresencePreference) {
  return prisma.user.update({
    where: { id: userId },
    data: { presencePreference },
    select: { presencePreference: true },
  });
}

// ==================== PUBLIC API ====================

export const presenceRepository = {
  findPreference,
  findPreferences,
  findVisibleUserIds,
  setPreference,
};
