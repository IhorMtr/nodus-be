import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  WorkspaceActivityCounts,
  WorkspaceMetricsTotals,
} from './workspace.types.js';

// ==================== TOTALS ====================

async function countTotals(
  client: Prisma.TransactionClient,
  workspaceId: string
): Promise<WorkspaceMetricsTotals> {
  const [
    members,
    channels,
    messages,
    directMessages,
    announcements,
    publishedAnnouncements,
  ] = await Promise.all([
    client.workspaceMember.count({ where: { workspaceId } }),
    client.channel.count({ where: { workspaceId } }),
    client.message.count({ where: { channel: { workspaceId } } }),
    client.directMessage.count({ where: { conversation: { workspaceId } } }),
    client.announcement.count({ where: { workspaceId } }),
    client.announcement.count({
      where: { workspaceId, publishedAt: { not: null } },
    }),
  ]);
  return {
    members,
    channels,
    messages,
    directMessages,
    announcements,
    publishedAnnouncements,
  };
}

// ==================== ACTIVITY ====================

async function countActivity(
  client: Prisma.TransactionClient,
  workspaceId: string,
  since: Date
): Promise<WorkspaceActivityCounts> {
  const rows = await client.$queryRaw<WorkspaceActivityCounts[]>`
    WITH activity AS (
      SELECT 'message' AS kind, m."authorId" AS "userId"
      FROM "Message" m
      JOIN "Channel" c ON c.id = m."channelId"
      WHERE c."workspaceId" = ${workspaceId}::uuid
        AND m."createdAt" >= ${since}::timestamptz
      UNION ALL
      SELECT 'directMessage', dm."authorId"
      FROM "DirectMessage" dm
      JOIN "Conversation" cv ON cv.id = dm."conversationId"
      WHERE cv."workspaceId" = ${workspaceId}::uuid
        AND dm."createdAt" >= ${since}::timestamptz
      UNION ALL
      SELECT 'announcement', a."authorId"
      FROM "Announcement" a
      WHERE a."workspaceId" = ${workspaceId}::uuid
        AND a."createdAt" >= ${since}::timestamptz
    )
    SELECT
      count(*) FILTER (WHERE a.kind = 'message')::int AS messages,
      count(*) FILTER (WHERE a.kind = 'directMessage')::int AS "directMessages",
      count(*) FILTER (WHERE a.kind = 'announcement')::int AS announcements,
      count(DISTINCT wm."userId")::int AS "activeMembers"
    FROM activity a
    LEFT JOIN "WorkspaceMember" wm
      ON wm."workspaceId" = ${workspaceId}::uuid AND wm."userId" = a."userId"
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('Activity aggregate returned no rows');
  }
  return row;
}

// ==================== PUBLIC API ====================

function collect<Period extends string>(
  workspaceId: string,
  periods: Readonly<Record<Period, Date>>
) {
  return prisma.$transaction(
    async transaction => {
      const entries = Object.entries(periods) as [Period, Date][];
      const [totals, ...activity] = await Promise.all([
        countTotals(transaction, workspaceId),
        ...entries.map(([, since]) =>
          countActivity(transaction, workspaceId, since)
        ),
      ]);
      return {
        totals,
        activity: Object.fromEntries(
          entries.map(([period], index) => [period, activity[index]!])
        ) as Record<Period, WorkspaceActivityCounts>,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

export const workspaceMetricsRepository = { collect };
