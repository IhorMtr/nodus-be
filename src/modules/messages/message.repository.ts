import { prisma } from '../../database/client.js';
import { isPrismaError } from '../../database/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  newerThan,
  olderThan,
  type Cursor,
} from '../../shared/pagination/cursor.js';
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
  const order = after ? 'asc' : 'desc';
  return prisma.message.findMany({
    where: {
      channelId,
      ...(before ? olderThan(before) : {}),
      ...(after ? newerThan(after) : {}),
    },
    select: messageSelect,
    orderBy: [{ createdAt: order }, { id: order }],
    take: limit + 1,
  });
}

function listContextSide(
  channelId: string,
  target: Cursor,
  direction: 'older' | 'newer',
  limit: number
) {
  const older = direction === 'older';
  const order = older ? 'desc' : 'asc';
  return prisma.message.findMany({
    where: {
      channelId,
      ...(older ? olderThan(target) : newerThan(target)),
    },
    select: messageSelect,
    orderBy: [{ createdAt: order }, { id: order }],
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
  return isPrismaError(error, 'recordNotFound');
}

export function isMessageRelationMissingError(error: unknown): boolean {
  return isPrismaError(error, 'foreignKeyViolation');
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
