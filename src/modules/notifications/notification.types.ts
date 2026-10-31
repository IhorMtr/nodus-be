import type { z } from 'zod';
import type { NotificationType } from '../../generated/prisma/client.js';
import type {
  notificationListQuerySchema,
  notificationParamsSchema,
} from './notification.schema.js';

// ==================== TYPES ====================

export type NotificationParams = z.infer<typeof notificationParamsSchema>;
export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;

export type PublicNotification = {
  id: string;
  userId: string;
  workspaceId: string;
  type: NotificationType;
  entityId: string | null;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = {
  items: PublicNotification[];
  page: number;
  limit: number;
  total: number;
};
