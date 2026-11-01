import { prisma } from '../../database/client.js';
import { Prisma, NotificationType } from '../../generated/prisma/client.js';
import type { DirectHistoryQuery } from './conversation.types.js';

// ==================== SELECTS ====================

const messageSelect = {
  id: true,
  conversationId: true,
  authorId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.DirectMessageSelect;

const conversationSelect = {
  id: true,
  workspaceId: true,
  firstUserId: true,
  secondUserId: true,
  createdAt: true,
  updatedAt: true,
  firstUser: { select: { id: true, firstName: true, lastName: true } },
  secondUser: { select: { id: true, firstName: true, lastName: true } },
  messages: {
    select: messageSelect,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
  },
} satisfies Prisma.ConversationSelect;

// ==================== CONVERSATIONS ====================

function find(id: string, workspaceId: string) {
  return prisma.conversation.findUnique({
    where: { id, workspaceId },
    select: conversationSelect,
  });
}

function findPair(
  workspaceId: string,
  firstUserId: string,
  secondUserId: string
) {
  return prisma.conversation.findUnique({
    where: {
      workspaceId_firstUserId_secondUserId: {
        workspaceId,
        firstUserId,
        secondUserId,
      },
    },
    select: conversationSelect,
  });
}

async function createPair(
  workspaceId: string,
  firstUserId: string,
  secondUserId: string
) {
  return prisma.$transaction(async tx => {
    const members = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "WorkspaceMember"
    WHERE "workspaceId" = ${workspaceId}::uuid
      AND "userId" IN (${firstUserId}::uuid, ${secondUserId}::uuid)
    ORDER BY "userId" FOR KEY SHARE
  `;
    if (members.length !== 2) return null;
    const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "Conversation" (id, "workspaceId", "firstUserId", "secondUserId", "createdAt", "updatedAt")
    SELECT gen_random_uuid(), ${workspaceId}::uuid, ${firstUserId}::uuid, ${secondUserId}::uuid,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    WHERE EXISTS (SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId" = ${workspaceId}::uuid AND "userId" = ${firstUserId}::uuid)
      AND EXISTS (SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId" = ${workspaceId}::uuid AND "userId" = ${secondUserId}::uuid)
    ON CONFLICT ("workspaceId", "firstUserId", "secondUserId") DO NOTHING
    RETURNING id
  `;
    return rows[0]?.id ?? null;
  });
}

function list(workspaceId: string, userId: string) {
  return prisma.conversation.findMany({
    where: {
      workspaceId,
      OR: [{ firstUserId: userId }, { secondUserId: userId }],
    },
    select: conversationSelect,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
}

function members(workspaceId: string, userIds: string[]) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId, userId: { in: userIds } },
    select: { userId: true },
  });
}

// ==================== MESSAGES ====================

function findMessage(conversationId: string, id: string) {
  return prisma.directMessage.findUnique({
    where: { id, conversationId },
    select: messageSelect,
  });
}

function listMessages(
  conversationId: string,
  { limit, before }: DirectHistoryQuery
) {
  return prisma.directMessage.findMany({
    where: {
      conversationId,
      ...(before
        ? {
            createdAt: { lte: before.createdAt },
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }
        : {}),
    },
    select: messageSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
}

async function createMessage(
  workspaceId: string,
  conversationId: string,
  authorId: string,
  recipientId: string,
  content: string
) {
  return prisma.$transaction(async tx => {
    const lockedMembers = await tx.$queryRaw<{ userId: string }[]>`
      SELECT "userId" FROM "WorkspaceMember"
      WHERE "workspaceId" = ${workspaceId}::uuid
        AND "userId" IN (${authorId}::uuid, ${recipientId}::uuid)
      ORDER BY "userId" FOR KEY SHARE
    `;
    if (lockedMembers.length !== 2) return null;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "DirectMessage" (id, "conversationId", "authorId", content, "createdAt", "updatedAt")
      SELECT gen_random_uuid(), c.id, ${authorId}::uuid, ${content}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "Conversation" c
      JOIN "WorkspaceMember" sender ON sender."workspaceId" = c."workspaceId" AND sender."userId" = ${authorId}::uuid
      JOIN "WorkspaceMember" recipient ON recipient."workspaceId" = c."workspaceId" AND recipient."userId" = ${recipientId}::uuid
      WHERE c.id = ${conversationId}::uuid AND c."workspaceId" = ${workspaceId}::uuid
        AND ((c."firstUserId" = ${authorId}::uuid AND c."secondUserId" = ${recipientId}::uuid)
          OR (c."secondUserId" = ${authorId}::uuid AND c."firstUserId" = ${recipientId}::uuid))
      RETURNING id
    `;
    const id = rows[0]?.id;
    if (!id) return null;
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
    const message = await tx.directMessage.findUniqueOrThrow({
      where: { id },
      select: messageSelect,
    });
    const notification = await tx.notification.create({
      data: {
        userId: recipientId,
        workspaceId,
        type: NotificationType.DirectMessageCreated,
        entityId: id,
        title: 'New direct message',
        message: content,
      },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        type: true,
        entityId: true,
        title: true,
        message: true,
        readAt: true,
        createdAt: true,
      },
    });
    return { message, notification };
  });
}

async function updateMessage(
  conversationId: string,
  id: string,
  authorId: string,
  content: string
) {
  const result = await prisma.directMessage.updateMany({
    where: { id, conversationId, authorId },
    data: { content },
  });
  return result.count ? findMessage(conversationId, id) : null;
}

async function deleteMessage(
  conversationId: string,
  id: string,
  authorId: string
) {
  const result = await prisma.directMessage.deleteMany({
    where: { id, conversationId, authorId },
  });
  return result.count === 1;
}

// ==================== READ STATE ====================

function readState(userId: string, conversationId: string) {
  return prisma.conversationReadState.findUnique({
    where: { userId_conversationId: { userId, conversationId } },
  });
}

async function advanceRead(
  workspaceId: string,
  userId: string,
  conversationId: string,
  messageId: string
) {
  const rows = await prisma.$queryRaw<
    { lastReadMessageId: string; lastReadAt: Date }[]
  >`
    INSERT INTO "ConversationReadState" ("userId", "workspaceId", "conversationId", "lastReadMessageId", "lastReadCreatedAt", "lastReadAt", "updatedAt")
    SELECT ${userId}::uuid, ${workspaceId}::uuid, c.id, m.id, m."createdAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "Conversation" c
    JOIN "WorkspaceMember" wm ON wm."workspaceId" = c."workspaceId" AND wm."userId" = ${userId}::uuid
    JOIN "DirectMessage" m ON m."conversationId" = c.id AND m.id = ${messageId}::uuid
    WHERE c.id = ${conversationId}::uuid AND c."workspaceId" = ${workspaceId}::uuid
      AND (c."firstUserId" = ${userId}::uuid OR c."secondUserId" = ${userId}::uuid)
    ON CONFLICT ("userId", "conversationId") DO UPDATE SET
      "lastReadMessageId" = EXCLUDED."lastReadMessageId",
      "lastReadCreatedAt" = EXCLUDED."lastReadCreatedAt",
      "lastReadAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
    WHERE ("ConversationReadState"."lastReadCreatedAt", "ConversationReadState"."lastReadMessageId")
      < (EXCLUDED."lastReadCreatedAt", EXCLUDED."lastReadMessageId")
    RETURNING "lastReadMessageId", "lastReadAt"
  `;
  return rows[0] ?? null;
}

async function countUnread(workspaceId: string, userId: string) {
  const rows = await prisma.$queryRaw<
    { conversationId: string; unreadCount: bigint }[]
  >`
    SELECT c.id AS "conversationId", count(m.id) AS "unreadCount"
    FROM "Conversation" c
    LEFT JOIN "ConversationReadState" r ON r."conversationId" = c.id AND r."userId" = ${userId}::uuid
    LEFT JOIN "DirectMessage" m ON m."conversationId" = c.id AND m."authorId" <> ${userId}::uuid
      AND (r."userId" IS NULL OR (m."createdAt", m.id) > (r."lastReadCreatedAt", r."lastReadMessageId"))
    WHERE c."workspaceId" = ${workspaceId}::uuid
      AND (c."firstUserId" = ${userId}::uuid OR c."secondUserId" = ${userId}::uuid)
    GROUP BY c.id
  `;
  return new Map(
    rows.map(row => [row.conversationId, Number(row.unreadCount)])
  );
}

// ==================== PUBLIC API ====================

export const conversationRepository = {
  find,
  findPair,
  createPair,
  list,
  members,
  findMessage,
  listMessages,
  createMessage,
  updateMessage,
  deleteMessage,
  readState,
  advanceRead,
  countUnread,
};
export type ConversationRecord = NonNullable<Awaited<ReturnType<typeof find>>>;
export type DirectMessageRecord = NonNullable<
  Awaited<ReturnType<typeof findMessage>>
>;
