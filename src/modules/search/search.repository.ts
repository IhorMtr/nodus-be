import { prisma } from '../../database/client.js';
import type { SearchQuery } from './search.types.js';

// ==================== SEARCH ====================

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, character => `\\${character}`);
}

function searchMessages(workspaceId: string, query: SearchQuery) {
  return prisma.message.findMany({
    where: {
      channel: { workspaceId },
      ...(query.channelId ? { channelId: query.channelId } : {}),
      content: { contains: escapeLikePattern(query.q), mode: 'insensitive' },
      ...(query.cursor
        ? {
            createdAt: { lte: query.cursor.createdAt },
            OR: [
              { createdAt: { lt: query.cursor.createdAt } },
              {
                createdAt: query.cursor.createdAt,
                id: { lt: query.cursor.id },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      channelId: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, firstName: true, lastName: true } },
      channel: { select: { id: true, name: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
}

// ==================== PUBLIC API ====================

export const searchRepository = { searchMessages };
export type SearchRecord = Awaited<ReturnType<typeof searchMessages>>[number];
