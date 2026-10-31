import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';

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
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }
  const target: unknown = error.meta?.['target'];
  if (
    target === channelNameIndex ||
    (Array.isArray(target) && target.includes(channelNameIndex))
  ) {
    return true;
  }

  // The PostgreSQL adapter reports expression index violations by index name.
  const adapterError = z
    .object({
      cause: z.object({
        kind: z.literal('UniqueConstraintViolation'),
        constraint: z.object({ index: z.string() }),
      }),
    })
    .safeParse(error.meta?.['driverAdapterError']);

  return (
    adapterError.success &&
    adapterError.data.cause.constraint.index === channelNameIndex
  );
}

export function isChannelNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  );
}

export function isChannelWorkspaceMissingError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2003'
  );
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
