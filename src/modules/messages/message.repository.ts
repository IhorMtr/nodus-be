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

function listChannelMessages(channelId: string, { limit, before }: MessageHistoryQuery) {
  return prisma.message.findMany({
    where: {
      channelId,
      ...(before ? {
        // Bound the index scan before applying the UUID tie-breaker.
        createdAt: { lte: before.createdAt },
        OR: [
          { createdAt: { lt: before.createdAt } },
          { createdAt: before.createdAt, id: { lt: before.id } },
        ],
      } : {}),
    },
    select: messageSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

async function deleteMessage(channelId: string, messageId: string): Promise<void> {
  await prisma.message.delete({
    where: { id: messageId, channelId },
    select: { id: true },
  });
}

// ==================== DATABASE ERRORS ====================

export function isMessageNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

export function isMessageRelationMissingError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

// ==================== PUBLIC API ====================

export const messageRepository = {
  createMessage,
  listChannelMessages,
  findMessage,
  updateMessage,
  deleteMessage,
};

export type MessageRepository = typeof messageRepository;
