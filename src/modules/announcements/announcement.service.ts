import { logger } from '../../config/logger.js';
import {
  enqueueAnnouncement,
  removeAnnouncementJob,
} from '../../queues/announcement.queue.js';
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

// ==================== TYPES AND HELPERS ====================

type AnnouncementRecord = NonNullable<
  Awaited<ReturnType<typeof announcementRepository.find>>
>;

function publicAnnouncement(record: AnnouncementRecord): PublicAnnouncement {
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

function assertFuture(date: Date) {
  if (date.getTime() <= Date.now()) throw announcementErrors.invalidPublishAt();
}

// ==================== SCHEDULING ====================

async function schedule(record: AnnouncementRecord) {
  if (!record.publishAt || record.publishedAt) return;
  try {
    await enqueueAnnouncement(
      record.id,
      record.scheduleVersion,
      record.publishAt
    );
  } catch (error) {
    // The worker reconciles pending database rows after Redis recovers.
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
    // Version checks make a stale job harmless even when removal fails.
    logger.warn(
      { err: error, announcementId: id },
      'Failed to remove stale announcement job'
    );
  }
}

// ==================== ANNOUNCEMENTS ====================

async function create(
  workspaceId: string,
  userId: string,
  input: CreateAnnouncementInput
): Promise<PublicAnnouncement> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  if (input.publishAt) assertFuture(input.publishAt);
  let record: AnnouncementRecord;
  try {
    record = await announcementRepository.create(
      workspaceId,
      userId,
      input.title,
      input.content,
      input.publishAt ?? null
    );
  } catch (error) {
    // A concurrent workspace deletion removes the membership before the insert.
    await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
    throw error;
  }
  await schedule(record);
  return publicAnnouncement(record);
}

async function list(
  workspaceId: string,
  userId: string
): Promise<PublicAnnouncement[]> {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  return (
    await announcementRepository.list(workspaceId, membership.role !== 'Member')
  ).map(publicAnnouncement);
}

async function get(
  workspaceId: string,
  userId: string,
  id: string
): Promise<PublicAnnouncement> {
  const membership = await requireWorkspaceMember(workspaceId, userId);
  const record = await announcementRepository.find(workspaceId, id);
  if (!record || (membership.role === 'Member' && !record.publishedAt))
    throw announcementErrors.notFound();
  return publicAnnouncement(record);
}

async function update(
  workspaceId: string,
  userId: string,
  id: string,
  input: UpdateAnnouncementInput
): Promise<PublicAnnouncement> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const current = await announcementRepository.find(workspaceId, id);
  if (!current) throw announcementErrors.notFound();
  if (input.publishAt && current.publishedAt)
    throw announcementErrors.alreadyPublished();
  if (input.publishAt) assertFuture(input.publishAt);
  const changesSchedule = input.publishAt !== undefined && !current.publishedAt;
  const updated = await announcementRepository.update(
    workspaceId,
    id,
    current.scheduleVersion,
    {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(changesSchedule
        ? {
            publishAt: input.publishAt!,
            publishedAt: input.publishAt === null ? new Date() : null,
            scheduleVersion: { increment: 1 },
          }
        : {}),
    }
  );
  if (!updated) {
    if (!(await announcementRepository.find(workspaceId, id)))
      throw announcementErrors.notFound();
    throw announcementErrors.conflict();
  }
  if (changesSchedule) {
    await unschedule(id, current.scheduleVersion);
    await schedule(updated);
  }
  return publicAnnouncement(updated);
}

async function remove(
  workspaceId: string,
  userId: string,
  id: string
): Promise<void> {
  await requireWorkspaceRole(workspaceId, userId, ['Owner', 'Admin']);
  const current = await announcementRepository.find(workspaceId, id);
  if (!current || !(await announcementRepository.remove(workspaceId, id)))
    throw announcementErrors.notFound();
  if (!current.publishedAt) await unschedule(id, current.scheduleVersion);
}

// ==================== PUBLIC API ====================

export const announcementService = { create, list, get, update, remove };
