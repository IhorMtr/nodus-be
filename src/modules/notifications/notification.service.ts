import { notificationErrors } from './notification.errors.js';
import {
  notificationRepository,
  type NotificationRecord,
} from './notification.repository.js';
import type {
  NotificationListQuery,
  NotificationPage,
  PublicNotification,
} from './notification.types.js';

// ==================== PUBLIC DATA ====================

export function toPublicNotification(
  record: NotificationRecord
): PublicNotification {
  return {
    id: record.id,
    userId: record.userId,
    workspaceId: record.workspaceId,
    type: record.type,
    entityId: record.entityId,
    title: record.title,
    message: record.message,
    readAt: record.readAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

// ==================== USER OPERATIONS ====================

async function list(
  userId: string,
  query: NotificationListQuery
): Promise<NotificationPage> {
  const { items, total } = await notificationRepository.list(userId, query);
  return { items: items.map(toPublicNotification), total, ...query };
}

async function markRead(
  userId: string,
  notificationId: string
): Promise<PublicNotification> {
  const record = await notificationRepository.markRead(userId, notificationId);
  if (!record) throw notificationErrors.notFound();
  return toPublicNotification(record);
}

async function markAllRead(userId: string): Promise<{ updatedCount: number }> {
  const result = await notificationRepository.markAllRead(userId);
  return { updatedCount: result.count };
}

async function unreadCount(userId: string): Promise<{ count: number }> {
  return { count: await notificationRepository.unreadCount(userId) };
}

// ==================== PUBLIC API ====================

export const notificationService = { list, markRead, markAllRead, unreadCount };
