import { logger } from '../../config/logger.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  enqueueAnnouncement,
  removeAnnouncementJob,
} from '../../queues/announcement.queue.js';
import { toPublicNotification } from '../notifications/notification.service.js';
import type { PublicNotification } from '../notifications/notification.types.js';
import {
  requireWorkspaceMember,
  requireWorkspaceRole,
} from '../workspaces/workspace.service.js';
import { announcementErrors } from './announcement.errors.js';
import { announcementRepository } from './announcement.repository.js';
import type {
  CreateAnnouncementInput,
  PublicAnnouncement,
  UpdateAnnouncementInput,
} from './announcement.types.js';

// ==================== TYPES ====================

type AnnouncementRecord = NonNullable<
  Awaited<ReturnType<typeof announcementRepository.find>>
>;

type AnnouncementChange = {
  announcement: PublicAnnouncement;
  notifications: PublicNotification[];
};

// ==================== PUBLIC DATA ====================

function toPublicAnnouncement(record: AnnouncementRecord): PublicAnnouncement {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    authorId: record.authorId,
    title: record.title,
    content: record.content,
    publishAt: record.publishAt?.toISOString() ?? null,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// ==================== VALIDATION ====================

function assertFuture(date: Date) {
  if (date.getTime() <= Date.now()) {
    throw announcementErrors.invalidPublishAt();
  }
}

// ==================== SCHEDULING ====================

async function schedule(record: AnnouncementRecord) {
  if (!record.publishAt || record.publishedAt) {
    return;
  }
  try {
    await enqueueAnnouncement(
      record.id,
      record.scheduleVersion,
      record.publishAt
    );
  } catch (error) {
    logger.error(
      { err: error, announcementId: record.id },
      'Failed to enqueue announcement; worker reconciliation will retry'
    );
  }
}

async function unschedule(id: string, version: number) {
  try {
    await removeAnnouncementJob(id, version);
  } catch (error) {
    logger.warn(
      { err: error, announcementId: id },
      'Failed to remove stale announcement job'
    );
  }
}

// ==================== QUERIES ====================

async function list(
  workspaceId: string,
  userId: string
): Promise<PublicAnnouncement[]> {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  const records = await announcementRepository.list(
    workspaceId,
    membership.role !== 'Member'
  );
  return records.map(toPublicAnnouncement);
}

async function get(
  workspaceId: string,
  userId: string,
  id: string
): Promise<PublicAnnouncement> {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  const record = await announcementRepository.find(workspaceId, id);
  const hiddenDraft = membership.role === 'Member' && !record?.publishedAt;
  if (!record || hiddenDraft) {
    throw announcementErrors.notFound();
  }
  return toPublicAnnouncement(record);
}

// ==================== MUTATIONS ====================

async function create(
  workspaceId: string,
  userId: string,
  input: CreateAnnouncementInput
): Promise<AnnouncementChange> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  if (input.publishAt) {
    assertFuture(input.publishAt);
  }

  let created: Awaited<ReturnType<typeof announcementRepository.create>>;
  try {
    created = await announcementRepository.create(
      workspaceId,
      userId,
      input.title,
      input.content,
      input.publishAt ?? null
    );
  } catch (error) {
    await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
    throw error;
  }

  await schedule(created.record);
  return {
    announcement: toPublicAnnouncement(created.record),
    notifications: created.notifications.map(toPublicNotification),
  };
}

async function update(
  workspaceId: string,
  userId: string,
  id: string,
  input: UpdateAnnouncementInput
): Promise<AnnouncementChange> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const current = await announcementRepository.find(workspaceId, id);
  if (!current) {
    throw announcementErrors.notFound();
  }
  if (input.publishAt && current.publishedAt) {
    throw announcementErrors.alreadyPublished();
  }
  if (input.publishAt) {
    assertFuture(input.publishAt);
  }

  const data: Prisma.AnnouncementUpdateManyMutationInput = {};
  if (input.title !== undefined) {
    data.title = input.title;
  }
  if (input.content !== undefined) {
    data.content = input.content;
  }
  const nextPublishAt = current.publishedAt ? undefined : input.publishAt;
  const changesSchedule = nextPublishAt !== undefined;
  if (nextPublishAt !== undefined) {
    data.publishAt = nextPublishAt;
    data.publishedAt = nextPublishAt === null ? new Date() : null;
    data.scheduleVersion = { increment: 1 };
  }

  const updated = await announcementRepository.update(
    workspaceId,
    id,
    current.scheduleVersion,
    data
  );
  if (!updated) {
    const exists = await announcementRepository.find(workspaceId, id);
    throw exists
      ? announcementErrors.conflict()
      : announcementErrors.notFound();
  }

  if (changesSchedule) {
    await unschedule(id, current.scheduleVersion);
    await schedule(updated.record);
  }
  return {
    announcement: toPublicAnnouncement(updated.record),
    notifications: updated.notifications.map(toPublicNotification),
  };
}

async function remove(
  workspaceId: string,
  userId: string,
  id: string
): Promise<void> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const current = await announcementRepository.find(workspaceId, id);
  if (!current) {
    throw announcementErrors.notFound();
  }
  const removed = await announcementRepository.remove(workspaceId, id);
  if (!removed) {
    throw announcementErrors.notFound();
  }
  if (!current.publishedAt) {
    await unschedule(id, current.scheduleVersion);
  }
}

// ==================== PUBLIC API ====================

export const announcementService = { create, list, get, update, remove };
