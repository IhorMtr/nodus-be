import { prisma } from '../../database/client.js';
import { Prisma, NotificationType } from '../../generated/prisma/client.js';
import type { NotificationListQuery } from './notification.types.js';

// ==================== SELECTS ====================

const select = {
  id: true,
  userId: true,
  workspaceId: true,
  type: true,
  entityId: true,
  title: true,
  message: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

// ==================== QUERIES ====================

async function list(userId: string, { page, limit }: NotificationListQuery) {
  const [items, total] = await prisma.$transaction([
    prisma.notification.findMany({
      where: { userId },
      select,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);
  return { items, total };
}

function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// ==================== MUTATIONS ====================

async function markRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return prisma.notification.findFirst({
    where: { id: notificationId, userId },
    select,
  });
}

function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

function create(
  client: Prisma.TransactionClient,
  data: Prisma.NotificationUncheckedCreateInput
) {
  return client.notification.create({ data, select });
}

async function createForAnnouncement(
  client: Prisma.TransactionClient,
  announcement: {
    id: string;
    workspaceId: string;
    authorId: string;
    title: string;
  }
) {
  const members = await client.workspaceMember.findMany({
    where: {
      workspaceId: announcement.workspaceId,
      userId: { not: announcement.authorId },
    },
    select: { userId: true },
  });
  if (members.length === 0) return [];
  return client.notification.createManyAndReturn({
    data: members.map(member => ({
      userId: member.userId,
      workspaceId: announcement.workspaceId,
      type: NotificationType.AnnouncementPublished,
      entityId: announcement.id,
      title: 'New announcement',
      message: announcement.title,
    })),
    skipDuplicates: true,
    select,
  });
}

// ==================== PUBLIC API ====================

export const notificationRepository = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  create,
  createForAnnouncement,
};

export type NotificationRecord = Awaited<
  ReturnType<typeof notificationRepository.create>
>;
