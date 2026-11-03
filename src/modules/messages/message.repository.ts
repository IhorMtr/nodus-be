import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { MessageHistoryQuery } from './message.types.js';

// ==================== SELECTS ====================

const messageSelect = {
  id: true,
  channelId: true,
  authorId: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.MessageSelect;

// ==================== DATABASE ACCESS ====================

function createMessage(channelId: string, authorId: string, content: string) {
  return prisma.message.create({
    data: { channelId, authorId, content },
    select: messageSelect,
  });
}

function listChannelMessages(
  channelId: string,
  { limit, before, after }: MessageHistoryQuery
) {
  return prisma.message.findMany({
    where: {
      channelId,
      ...(before
        ? {
            // Bound the index scan before applying the UUID tie-breaker.
            createdAt: { lte: before.createdAt },
            OR: [
              { createdAt: { lt: before.createdAt } },
              { createdAt: before.createdAt, id: { lt: before.id } },
            ],
          }
        : {}),
      ...(after
        ? {
            createdAt: { gte: after.createdAt },
            OR: [
              { createdAt: { gt: after.createdAt } },
              { createdAt: after.createdAt, id: { gt: after.id } },
            ],
          }
        : {}),
    },
    select: messageSelect,
    orderBy: after
      ? [{ createdAt: 'asc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
}

function listContextSide(
  channelId: string,
  target: { createdAt: Date; id: string },
  direction: 'older' | 'newer',
  limit: number
) {
  const older = direction === 'older';
  return prisma.message.findMany({
    where: {
      channelId,
      createdAt: older ? { lte: target.createdAt } : { gte: target.createdAt },
      OR: older
        ? [
            { createdAt: { lt: target.createdAt } },
            { createdAt: target.createdAt, id: { lt: target.id } },
          ]
        : [
            { createdAt: { gt: target.createdAt } },
            { createdAt: target.createdAt, id: { gt: target.id } },
          ],
    },
    select: messageSelect,
    orderBy: [
      { createdAt: older ? 'desc' : 'asc' },
      { id: older ? 'desc' : 'asc' },
    ],
    take: limit + 1,
  });
}

function findMessage(channelId: string, messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId, channelId },
    select: messageSelect,
  });
}

function updateMessage(channelId: string, messageId: string, content: string) {
  return prisma.message.update({
    where: { id: messageId, channelId },
    data: { content },
    select: messageSelect,
  });
}

async function deleteMessage(
  channelId: string,
  messageId: string
): Promise<void> {
  await prisma.message.delete({
    where: { id: messageId, channelId },
    select: { id: true },
  });
}

// ==================== DATABASE ERRORS ====================

export function isMessageNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

export function isMessageRelationMissingError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
}

// ==================== PUBLIC API ====================

export const messageRepository = {
  createMessage,
  listChannelMessages,
  listContextSide,
  findMessage,
  updateMessage,
  deleteMessage,
};

export type MessageRepository = typeof messageRepository;
