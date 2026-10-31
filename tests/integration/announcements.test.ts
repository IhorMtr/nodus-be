import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { publishAnnouncementJob } from '../../src/modules/announcements/announcement.publisher.js';
import {
  announcementQueue,
  announcementJobId,
} from '../../src/queues/announcement.queue.js';
import { closeRedis } from '../../src/redis/client.js';
import { authorization, createUser, testEmailPrefix } from './helpers.js';

type Body<T> = { data: T; messageType: string | null };
type Announcement = {
  id: string;
  publishAt: string | null;
  publishedAt: string | null;
  title: string;
};
const createdJobs = new Set<string>();

function track(id: string, version = 0) {
  createdJobs.add(announcementJobId(id, version));
}

async function workspace(token: string) {
  const result = await request(app)
    .post('/workspaces')
    .set(authorization(token))
    .send({ name: 'Announcements' });
  expect(result.status).toBe(201);
  return (result.body as Body<{ id: string }>).data.id;
}

beforeAll(async () => {
  const name = process.env.DATABASE_URL
    ? (new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0] ?? '')
    : '';
  if (!name.endsWith('_test'))
    throw new Error('Integration tests require a database ending in _test');
  await prisma.$connect();
});

afterEach(async () => {
  for (const id of createdJobs) {
    const job = await announcementQueue.getJob(id);
    if (job) await job.remove();
  }
  createdJobs.clear();
  const users = await prisma.user.findMany({
    where: { email: { startsWith: testEmailPrefix } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: { in: userIds } },
    select: { workspaceId: true },
  });
  await prisma.$transaction(async tx => {
    await tx.workspace.deleteMany({
      where: { id: { in: memberships.map(({ workspaceId }) => workspaceId) } },
    });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
});

afterAll(async () => {
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
});

describe('workspace announcements', () => {
  it('publishes immediately and enforces workspace visibility and roles', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const adminId = (
      await prisma.user.findUniqueOrThrow({ where: { email: admin.email } })
    ).id;
    const memberId = (
      await prisma.user.findUniqueOrThrow({ where: { email: member.email } })
    ).id;
    await prisma.workspaceMember.createMany({
      data: [
        { workspaceId, userId: adminId, role: 'Admin' },
        { workspaceId, userId: memberId, role: 'Member' },
      ],
    });
    const base = `/workspaces/${workspaceId}/announcements`;
    const created = await request(app)
      .post(base)
      .set(authorization(owner.accessToken))
      .send({ title: ' Hello ', content: 'World' });
    expect(created.status).toBe(201);
    const immediate = (created.body as Body<Announcement>).data;
    expect(immediate.title).toBe('Hello');
    expect(immediate.publishedAt).not.toBeNull();
    expect(immediate.publishAt).toBeNull();
    expect(
      (await request(app).get(base).set(authorization(member.accessToken))).body
        .data
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .post(base)
          .set(authorization(member.accessToken))
          .send({ title: 'No', content: 'No' })
      ).status
    ).toBe(403);
    expect(
      (await request(app).get(base).set(authorization(outsider.accessToken)))
        .body.messageType
    ).toBe('WorkspaceNotFound');
    expect(
      (
        await request(app)
          .patch(`${base}/${immediate.id}`)
          .set(authorization(admin.accessToken))
          .send({ title: 'Updated' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .delete(`${base}/${immediate.id}`)
          .set(authorization(admin.accessToken))
      ).status
    ).toBe(200);
  });

  it('schedules, reschedules, publishes once, and hides pending items from Members', async () => {
    const owner = await createUser();
    const member = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const memberId = (
      await prisma.user.findUniqueOrThrow({ where: { email: member.email } })
    ).id;
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: memberId },
    });
    const base = `/workspaces/${workspaceId}/announcements`;
    const future = new Date(Date.now() + 120_000).toISOString();
    const created = await request(app)
      .post(base)
      .set(authorization(owner.accessToken))
      .send({ title: 'Later', content: 'Text', publishAt: future });
    expect(created.status).toBe(201);
    const pending = (created.body as Body<Announcement>).data;
    track(pending.id);
    expect(pending.publishedAt).toBeNull();
    expect(
      await announcementQueue.getJob(announcementJobId(pending.id, 0))
    ).not.toBeUndefined();
    expect(
      (await request(app).get(base).set(authorization(member.accessToken))).body
        .data
    ).toEqual([]);
    expect(
      (
        await request(app)
          .get(`${base}/${pending.id}`)
          .set(authorization(member.accessToken))
      ).body.messageType
    ).toBe('AnnouncementNotFound');
    const later = new Date(Date.now() + 180_000).toISOString();
    expect(
      (
        await request(app)
          .patch(`${base}/${pending.id}`)
          .set(authorization(owner.accessToken))
          .send({ publishAt: later })
      ).status
    ).toBe(200);
    track(pending.id, 1);
    expect(
      await announcementQueue.getJob(announcementJobId(pending.id, 0))
    ).toBeUndefined();
    expect(
      await announcementQueue.getJob(announcementJobId(pending.id, 1))
    ).not.toBeUndefined();
    const invalidUpdate = await request(app)
      .patch(`${base}/${pending.id}`)
      .set(authorization(owner.accessToken))
      .send({ publishAt: new Date(Date.now() - 1000).toISOString() });
    expect(invalidUpdate.status).toBe(400);
    expect((invalidUpdate.body as Body<never>).messageType).toBe(
      'InvalidPublishAt'
    );
    expect(
      await publishAnnouncementJob({
        announcementId: pending.id,
        scheduleVersion: 0,
      })
    ).toBe(false);
    await prisma.announcement.update({
      where: { id: pending.id },
      data: { publishAt: new Date(Date.now() - 1000) },
    });
    expect(
      await publishAnnouncementJob({
        announcementId: pending.id,
        scheduleVersion: 1,
      })
    ).toBe(true);
    expect(
      await publishAnnouncementJob({
        announcementId: pending.id,
        scheduleVersion: 1,
      })
    ).toBe(false);
    expect(
      (await request(app).get(base).set(authorization(member.accessToken))).body
        .data
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .patch(`${base}/${pending.id}`)
          .set(authorization(owner.accessToken))
          .send({ publishAt: later })
      ).body.messageType
    ).toBe('AnnouncementAlreadyPublished');
  });

  it('prevents deleted and workspace-cascaded announcements from publishing and rejects invalid times', async () => {
    const owner = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const base = `/workspaces/${workspaceId}/announcements`;
    const invalid = await request(app)
      .post(base)
      .set(authorization(owner.accessToken))
      .send({
        title: 'Bad',
        content: 'Text',
        publishAt: new Date(Date.now() - 1000).toISOString(),
      });
    expect(invalid.status).toBe(400);
    expect((invalid.body as Body<never>).messageType).toBe('InvalidPublishAt');
    const future = new Date(Date.now() + 120_000).toISOString();
    const created = await request(app)
      .post(base)
      .set(authorization(owner.accessToken))
      .send({ title: 'Later', content: 'Text', publishAt: future });
    const id = (created.body as Body<Announcement>).data.id;
    track(id);
    expect(
      (
        await request(app)
          .delete(`${base}/${id}`)
          .set(authorization(owner.accessToken))
      ).status
    ).toBe(200);
    expect(
      await publishAnnouncementJob({ announcementId: id, scheduleVersion: 0 })
    ).toBe(false);
    const another = await request(app)
      .post(base)
      .set(authorization(owner.accessToken))
      .send({ title: 'Later', content: 'Text', publishAt: future });
    const anotherId = (another.body as Body<Announcement>).data.id;
    track(anotherId);
    expect(
      (
        await request(app)
          .delete(`/workspaces/${workspaceId}`)
          .set(authorization(owner.accessToken))
      ).status
    ).toBe(200);
    expect(
      await publishAnnouncementJob({
        announcementId: anotherId,
        scheduleVersion: 0,
      })
    ).toBe(false);
  });
});
