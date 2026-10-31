import { z } from 'zod';

// ==================== FIELD SCHEMAS ====================

const uuid = z.uuid().transform(value => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max);
const publishAt = z.iso
  .datetime({ offset: true })
  .transform(value => new Date(value));

// ==================== REQUEST SCHEMAS ====================

export const createAnnouncementSchema = z.strictObject({
  title: text(200),
  content: text(4000),
  publishAt: publishAt.optional(),
});
export const updateAnnouncementSchema = z
  .strictObject({
    title: text(200).optional(),
    content: text(4000).optional(),
    publishAt: publishAt.nullable().optional(),
  })
  .refine(value => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });
// ==================== PATH PARAMETERS ====================

export const announcementWorkspaceParamsSchema = z.strictObject({
  workspaceId: uuid,
});
export const announcementParamsSchema =
  announcementWorkspaceParamsSchema.extend({ announcementId: uuid });
