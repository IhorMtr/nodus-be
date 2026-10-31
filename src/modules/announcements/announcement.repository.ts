import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';

// ==================== SELECTS ====================

const select = {
  id: true,
  workspaceId: true,
  authorId: true,
  title: true,
  content: true,
  publishAt: true,
  publishedAt: true,
  scheduleVersion: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AnnouncementSelect;

// ==================== DATABASE ACCESS ====================

function create(
  workspaceId: string,
  authorId: string,
  title: string,
  content: string,
  publishAt: Date | null
) {
  return prisma.announcement.create({
    data: {
      workspaceId,
      authorId,
      title,
      content,
      publishAt,
      publishedAt: publishAt ? null : new Date(),
    },
    select,
  });
}

function find(workspaceId: string, id: string) {
  return prisma.announcement.findFirst({ where: { id, workspaceId }, select });
}

function list(workspaceId: string, includeUnpublished: boolean) {
  return prisma.announcement.findMany({
    where: {
      workspaceId,
      ...(includeUnpublished ? {} : { publishedAt: { not: null } }),
    },
    select,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async function update(
  workspaceId: string,
  id: string,
  expectedVersion: number,
  data: Prisma.AnnouncementUpdateManyMutationInput
) {
  const result = await prisma.announcement.updateMany({
    where: {
      workspaceId,
      id,
      scheduleVersion: expectedVersion,
      ...(data.scheduleVersion ? { publishedAt: null } : {}),
    },
    data,
  });
  if (result.count !== 1) return null;
  return find(workspaceId, id);
}

async function remove(workspaceId: string, id: string) {
  return (
    (await prisma.announcement.deleteMany({ where: { workspaceId, id } }))
      .count === 1
  );
}

function pending() {
  return prisma.announcement.findMany({
    where: { publishedAt: null, publishAt: { not: null } },
    select: { id: true, publishAt: true, scheduleVersion: true },
  });
}

async function publish(id: string, version: number) {
  return (
    (
      await prisma.announcement.updateMany({
        where: {
          id,
          scheduleVersion: version,
          publishedAt: null,
          publishAt: { lte: new Date() },
        },
        data: { publishedAt: new Date() },
      })
    ).count === 1
  );
}

// ==================== PUBLIC API ====================

export const announcementRepository = {
  create,
  find,
  list,
  update,
  remove,
  pending,
  publish,
};
