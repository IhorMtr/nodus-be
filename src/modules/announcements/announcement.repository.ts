import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import { notificationRepository } from '../notifications/notification.repository.js';

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
  return prisma.$transaction(async transaction => {
    const record = await transaction.announcement.create({
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
    const notifications = publishAt
      ? []
      : await notificationRepository.createForAnnouncement(transaction, record);
    return { record, notifications };
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
  return prisma.$transaction(async transaction => {
    const result = await transaction.announcement.updateMany({
      where: {
        workspaceId,
        id,
        scheduleVersion: expectedVersion,
        ...(data.scheduleVersion ? { publishedAt: null } : {}),
      },
      data,
    });
    if (result.count !== 1) return null;
    const record = await transaction.announcement.findFirstOrThrow({
      where: { workspaceId, id },
      select,
    });
    const notifications =
      data.scheduleVersion && record.publishedAt
        ? await notificationRepository.createForAnnouncement(
            transaction,
            record
          )
        : [];
    return { record, notifications };
  });
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
  return prisma.$transaction(async transaction => {
    const result = await transaction.announcement.updateMany({
      where: {
        id,
        scheduleVersion: version,
        publishedAt: null,
        publishAt: { lte: new Date() },
      },
      data: { publishedAt: new Date() },
    });
    if (result.count !== 1) return null;
    const record = await transaction.announcement.findUniqueOrThrow({
      where: { id },
      select,
    });
    return notificationRepository.createForAnnouncement(transaction, record);
  });
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
