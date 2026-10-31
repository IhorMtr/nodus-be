import type { z } from 'zod';
import type {
  announcementParamsSchema,
  announcementWorkspaceParamsSchema,
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from './announcement.schema.js';

// ==================== REQUEST TYPES ====================

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;
export type AnnouncementWorkspaceParams = z.infer<
  typeof announcementWorkspaceParamsSchema
>;
export type AnnouncementParams = z.infer<typeof announcementParamsSchema>;

// ==================== RESPONSE TYPES ====================

export type PublicAnnouncement = {
  id: string;
  workspaceId: string;
  authorId: string;
  title: string;
  content: string;
  publishAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
