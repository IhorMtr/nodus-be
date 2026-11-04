import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import type { WorkspaceMetrics } from '../../src/modules/workspaces/workspace.types.js';
import {
  authorization,
  createUser,
  testEmailPrefix,
  type TestUser,
  assertTestDatabase,
} from './helpers.js';

// ==================== TYPES ====================

type Body<T> = { data: T; messageType: string | null };

// ==================== HELPERS ====================

const dayMs = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * dayMs);
}

async function userId(user: TestUser): Promise<string> {
  return (
    await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
      select: { id: true },
    })
  ).id;
}

async function createWorkspace(owner: TestUser): Promise<string> {
  const result = await request(app)
    .post('/workspaces')
    .set(authorization(owner.accessToken))
    .send({ name: 'Metrics workspace' });
  expect(result.status).toBe(201);
  return (result.body as Body<{ id: string }>).data.id;
}

async function addMember(
  workspaceId: string,
  user: TestUser,
  role: 'Admin' | 'Member'
): Promise<void> {
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: await userId(user), role },
  });
}

async function generalChannelId(workspaceId: string): Promise<string> {
  return (
    await prisma.channel.findFirstOrThrow({
      where: { workspaceId },
      select: { id: true },
    })
  ).id;
}

async function sendMessage(
  workspaceId: string,
  channelId: string,
  author: TestUser,
  content: string
): Promise<string> {
  const result = await request(app)
    .post(`/workspaces/${workspaceId}/channels/${channelId}/messages`)
    .set(authorization(author.accessToken))
    .send({ content });
  expect(result.status).toBe(201);
  return (result.body as Body<{ id: string }>).data.id;
}

async function openConversation(
  workspaceId: string,
  author: TestUser,
  peer: TestUser
): Promise<string> {
  const result = await request(app)
    .post(`/workspaces/${workspaceId}/conversations`)
    .set(authorization(author.accessToken))
    .send({ userId: await userId(peer) });
  expect([200, 201]).toContain(result.status);
  return (result.body as Body<{ id: string }>).data.id;
}

async function sendDirectMessage(
  workspaceId: string,
  conversationId: string,
  author: TestUser,
  content: string
): Promise<string> {
  const result = await request(app)
    .post(`/workspaces/${workspaceId}/conversations/${conversationId}/messages`)
    .set(authorization(author.accessToken))
    .send({ content });
  expect(result.status).toBe(201);
  return (result.body as Body<{ id: string }>).data.id;
}

async function publishAnnouncement(
  workspaceId: string,
  author: TestUser
): Promise<string> {
  const result = await request(app)
    .post(`/workspaces/${workspaceId}/announcements`)
    .set(authorization(author.accessToken))
    .send({ title: 'Update', content: 'Published now' });
  expect(result.status).toBe(201);
  return (result.body as Body<{ id: string }>).data.id;
}

function getMetrics(workspaceId: string, token: string) {
  return request(app)
    .get(`/workspaces/${workspaceId}/metrics`)
    .set(authorization(token));
}

async function metrics(
  workspaceId: string,
  token: string
): Promise<WorkspaceMetrics> {
  const result = await getMetrics(workspaceId, token);
  expect(result.status).toBe(200);
  expect(result.headers['cache-control']).toBe('no-store');
  return (result.body as Body<WorkspaceMetrics>).data;
}

// ==================== DATABASE LIFECYCLE ====================

beforeAll(async () => {
  assertTestDatabase();
  await prisma.$connect();
});

afterEach(async () => {
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

afterAll(async () => prisma.$disconnect());

// ==================== EMPTY WORKSPACE AND ACCESS ====================

describe('workspace metrics', () => {
  it('returns zero activity to Owner and Admin and hides it from others', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspaceId = await createWorkspace(owner);
    await addMember(workspaceId, admin, 'Admin');
    await addMember(workspaceId, member, 'Member');
    const before = Date.now();
    const data = await metrics(workspaceId, owner.accessToken);

    expect(data.totals).toEqual({
      members: 3,
      channels: 1,
      messages: 0,
      directMessages: 0,
      announcements: 0,
      publishedAnnouncements: 0,
    });
    const empty = {
      messages: 0,
      directMessages: 0,
      announcements: 0,
      activeMembers: 0,
    };
    expect(data.activity.last7Days).toMatchObject(empty);
    expect(data.activity.last30Days).toMatchObject(empty);

    const generatedAt = Date.parse(data.generatedAt);
    expect(generatedAt).toBeGreaterThanOrEqual(before);
    expect(generatedAt - Date.parse(data.activity.last7Days.since)).toBe(
      7 * dayMs
    );
    expect(generatedAt - Date.parse(data.activity.last30Days.since)).toBe(
      30 * dayMs
    );

    const adminMetrics = await metrics(workspaceId, admin.accessToken);
    expect(adminMetrics.totals.members).toBe(3);

    const denied = await getMetrics(workspaceId, member.accessToken);
    expect(denied.status).toBe(403);
    expect((denied.body as Body<null>).messageType).toBe(
      'InsufficientWorkspaceRole'
    );

    const hidden = await getMetrics(workspaceId, outsider.accessToken);
    expect(hidden.status).toBe(404);
    expect((hidden.body as Body<null>).messageType).toBe('WorkspaceNotFound');

    const missing = await getMetrics(
      '00000000-0000-4000-8000-000000000000',
      owner.accessToken
    );
    expect(missing.status).toBe(404);
    expect((missing.body as Body<null>).messageType).toBe('WorkspaceNotFound');

    const invalid = await getMetrics('not-a-uuid', owner.accessToken);
    expect(invalid.status).toBe(400);
    expect((invalid.body as Body<null>).messageType).toBe('ValidationFailed');

    const anonymous = await request(app).get(
      `/workspaces/${workspaceId}/metrics`
    );
    expect(anonymous.status).toBe(401);
    expect((anonymous.body as Body<null>).messageType).toBe('Unauthorized');
  });

  // ==================== ACTIVITY ====================

  it('counts totals and rolling activity for this workspace only', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const quiet = await createUser();
    const former = await createUser();
    const workspaceId = await createWorkspace(owner);
    await addMember(workspaceId, admin, 'Admin');
    await addMember(workspaceId, member, 'Member');
    await addMember(workspaceId, quiet, 'Member');
    await addMember(workspaceId, former, 'Member');
    const generalId = await generalChannelId(workspaceId);
    const second = await request(app)
      .post(`/workspaces/${workspaceId}/channels`)
      .set(authorization(owner.accessToken))
      .send({ name: 'second' });
    expect(second.status).toBe(201);
    const secondId = (second.body as Body<{ id: string }>).data.id;

    const memberRecent = [
      await sendMessage(workspaceId, generalId, member, 'recent one'),
      await sendMessage(workspaceId, secondId, member, 'recent two'),
    ];
    const conversationId = await openConversation(workspaceId, member, quiet);
    const memberDirect = await sendDirectMessage(
      workspaceId,
      conversationId,
      member,
      'recent direct'
    );
    const ownerMid = await sendMessage(workspaceId, generalId, owner, 'mid');
    const quietOld = await sendMessage(workspaceId, generalId, quiet, 'old');
    const quietOldDirect = await sendDirectMessage(
      workspaceId,
      conversationId,
      quiet,
      'old direct'
    );
    await publishAnnouncement(workspaceId, admin);
    await prisma.announcement.createMany({
      data: [
        {
          workspaceId,
          authorId: await userId(admin),
          title: 'Scheduled',
          content: 'Not visible yet',
          publishAt: new Date(Date.now() + dayMs),
          createdAt: daysAgo(10),
        },
        {
          workspaceId,
          authorId: await userId(quiet),
          title: 'Old',
          content: 'Old announcement',
          publishedAt: daysAgo(60),
          createdAt: daysAgo(60),
        },
      ],
    });
    await sendMessage(workspaceId, generalId, former, 'before removal');
    const removed = await request(app)
      .delete(`/workspaces/${workspaceId}/members/${await userId(former)}`)
      .set(authorization(owner.accessToken));
    expect(removed.status).toBe(200);

    await prisma.message.updateMany({
      where: { id: { in: memberRecent } },
      data: { createdAt: daysAgo(2) },
    });
    await prisma.directMessage.update({
      where: { id: memberDirect },
      data: { createdAt: daysAgo(3) },
    });
    await prisma.message.update({
      where: { id: ownerMid },
      data: { createdAt: daysAgo(20) },
    });
    await prisma.message.update({
      where: { id: quietOld },
      data: { createdAt: daysAgo(45) },
    });
    await prisma.directMessage.update({
      where: { id: quietOldDirect },
      data: { createdAt: daysAgo(31) },
    });

    const otherId = await createWorkspace(quiet);
    await addMember(otherId, member, 'Member');
    const otherGeneral = await generalChannelId(otherId);
    await sendMessage(otherId, otherGeneral, quiet, 'other');
    await sendMessage(otherId, otherGeneral, member, 'other member');
    const otherConversation = await openConversation(otherId, quiet, member);
    await sendDirectMessage(otherId, otherConversation, quiet, 'other dm');
    await publishAnnouncement(otherId, quiet);

    const data = await metrics(workspaceId, owner.accessToken);
    expect(data.totals).toEqual({
      members: 4,
      channels: 2,
      messages: 5,
      directMessages: 2,
      announcements: 3,
      publishedAnnouncements: 2,
    });
    expect(data.activity.last7Days).toMatchObject({
      messages: 3,
      directMessages: 1,
      announcements: 1,
      activeMembers: 2,
    });
    expect(data.activity.last30Days).toMatchObject({
      messages: 4,
      directMessages: 1,
      announcements: 2,
      activeMembers: 3,
    });

    const other = await metrics(otherId, quiet.accessToken);
    expect(other.totals).toEqual({
      members: 2,
      channels: 1,
      messages: 2,
      directMessages: 1,
      announcements: 1,
      publishedAnnouncements: 1,
    });
    expect(other.activity.last7Days).toMatchObject({
      messages: 2,
      directMessages: 1,
      announcements: 1,
      activeMembers: 2,
    });
  });
});
