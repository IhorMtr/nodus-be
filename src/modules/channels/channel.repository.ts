import { prisma } from '../../database/client.js';
import {
  isPrismaError,
  uniqueViolationTargets,
} from '../../database/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';

// ==================== SELECTS ====================

const channelSelect = {
  id: true,
  workspaceId: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChannelSelect;

const channelNameIndex = 'Channel_workspaceId_name_ci_key';

// ==================== DATABASE ACCESS ====================

function createChannel(workspaceId: string, name: string) {
  return prisma.channel.create({
    data: { workspaceId, name },
    select: channelSelect,
  });
}

function listWorkspaceChannels(workspaceId: string) {
  return prisma.channel.findMany({
    where: { workspaceId },
    select: channelSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

function findChannel(workspaceId: string, channelId: string) {
  return prisma.channel.findUnique({
    where: { id: channelId, workspaceId },
    select: channelSelect,
  });
}

function updateChannel(workspaceId: string, channelId: string, name: string) {
  return prisma.channel.update({
    where: { id: channelId, workspaceId },
    data: { name },
    select: channelSelect,
  });
}

async function deleteChannel(
  workspaceId: string,
  channelId: string
): Promise<void> {
  await prisma.channel.delete({
    where: { id: channelId, workspaceId },
    select: { id: true },
  });
}

// ==================== DATABASE ERRORS ====================

export function isChannelNameConflictError(error: unknown): boolean {
  return uniqueViolationTargets(error).includes(channelNameIndex);
}

export function isChannelNotFoundError(error: unknown): boolean {
  return isPrismaError(error, 'recordNotFound');
}

export function isChannelWorkspaceMissingError(error: unknown): boolean {
  return isPrismaError(error, 'foreignKeyViolation');
}

// ==================== PUBLIC API ====================

export const channelRepository = {
  createChannel,
  listWorkspaceChannels,
  findChannel,
  updateChannel,
  deleteChannel,
};

export type ChannelRepository = typeof channelRepository;
