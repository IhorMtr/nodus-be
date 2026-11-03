import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';

// ==================== TYPES ====================

type ReadStateRow = {
  lastReadMessageId: string;
  lastReadCreatedAt: Date;
  lastReadAt: Date;
};

type UnreadRow = { channelId: string; unreadCount: bigint };

// ==================== QUERIES ====================

function find(userId: string, channelId: string) {
  return prisma.channelReadState.findUnique({
    where: { userId_channelId: { userId, channelId } },
    select: {
      lastReadMessageId: true,
      lastReadCreatedAt: true,
      lastReadAt: true,
    },
  });
}

async function countUnread(
  workspaceId: string,
  userId: string,
  channelId?: string
) {
  const rows = await prisma.$queryRaw<UnreadRow[]>`
    SELECT c.id AS "channelId", count(m.id) AS "unreadCount"
    FROM "Channel" c
    LEFT JOIN "ChannelReadState" r ON r."channelId" = c.id AND r."userId" = ${userId}::uuid
    LEFT JOIN "Message" m ON m."channelId" = c.id AND m."authorId" <> ${userId}::uuid
      AND (r."userId" IS NULL OR (m."createdAt", m.id) > (r."lastReadCreatedAt", r."lastReadMessageId"))
    WHERE c."workspaceId" = ${workspaceId}::uuid
      AND (${channelId ?? null}::uuid IS NULL OR c.id = ${channelId ?? null}::uuid)
    GROUP BY c.id
  `;
  return new Map(rows.map(row => [row.channelId, Number(row.unreadCount)]));
}

// ==================== MUTATIONS ====================

async function advance(
  workspaceId: string,
  userId: string,
  channelId: string,
  messageId: string
): Promise<ReadStateRow | null> {
  const rows = await prisma.$queryRaw<ReadStateRow[]>`
    INSERT INTO "ChannelReadState" (
      "userId", "workspaceId", "channelId", "lastReadMessageId",
      "lastReadCreatedAt", "lastReadAt", "updatedAt"
    )
    SELECT ${userId}::uuid, ${workspaceId}::uuid, c.id, m.id,
      m."createdAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Channel" c
    JOIN "WorkspaceMember" wm ON wm."workspaceId" = c."workspaceId" AND wm."userId" = ${userId}::uuid
    JOIN "Message" m ON m."channelId" = c.id AND m.id = ${messageId}::uuid
    WHERE c.id = ${channelId}::uuid AND c."workspaceId" = ${workspaceId}::uuid
    ON CONFLICT ("userId", "channelId") DO UPDATE SET
      "lastReadMessageId" = EXCLUDED."lastReadMessageId",
      "lastReadCreatedAt" = EXCLUDED."lastReadCreatedAt",
      "lastReadAt" = CURRENT_TIMESTAMP,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE ("ChannelReadState"."lastReadCreatedAt", "ChannelReadState"."lastReadMessageId")
      < (EXCLUDED."lastReadCreatedAt", EXCLUDED."lastReadMessageId")
    RETURNING "lastReadMessageId", "lastReadCreatedAt", "lastReadAt"
  `;
  return rows[0] ?? null;
}

// ==================== RECEIPTS ====================

async function receipts(channelId: string, messageIds: string[]) {
  if (messageIds.length === 0)
    return new Map<
      string,
      { id: string; firstName: string; lastName: string }[]
    >();
  const rows = await prisma.$queryRaw<
    { messageId: string; id: string; firstName: string; lastName: string }[]
  >`
    SELECT m.id AS "messageId", u.id, u."firstName", u."lastName"
    FROM "Message" m
    JOIN "Channel" c ON c.id = m."channelId"
    JOIN "ChannelReadState" r ON r."channelId" = c.id AND r."userId" <> m."authorId"
      AND (r."lastReadCreatedAt", r."lastReadMessageId") >= (m."createdAt", m.id)
    JOIN "WorkspaceMember" wm ON wm."workspaceId" = c."workspaceId" AND wm."userId" = r."userId"
    JOIN "User" u ON u.id = r."userId"
    WHERE m."channelId" = ${channelId}::uuid AND m.id IN (${Prisma.join(messageIds.map(id => Prisma.sql`${id}::uuid`))})
    ORDER BY u.id
  `;
  const result = new Map<
    string,
    { id: string; firstName: string; lastName: string }[]
  >();
  for (const row of rows) {
    const readers = result.get(row.messageId) ?? [];
    readers.push({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
    });
    result.set(row.messageId, readers);
  }
  return result;
}

function reader(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true },
  });
}

async function memberIds(workspaceId: string) {
  const rows = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  return rows.map(row => row.userId);
}

// ==================== PUBLIC API ====================

export const channelReadStateRepository = {
  find,
  countUnread,
  advance,
  receipts,
  reader,
  memberIds,
};
