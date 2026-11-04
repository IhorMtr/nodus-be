import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import {
  authorization,
  createUser,
  testEmailPrefix,
  assertTestDatabase,
} from './helpers.js';

// ==================== TYPES ====================

type Page = {
  data: {
    items: { id: string; createdAt: string; receipt: { read: boolean } }[];
    nextCursor?: string | null;
    previousCursor?: string | null;
    olderCursor?: string | null;
    newerCursor?: string | null;
    targetMessageId?: string;
  };
  messageType: string | null;
};

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
  const userIds = users.map(user => user.id);
  const members = await prisma.workspaceMember.findMany({
    where: { userId: { in: userIds } },
    select: { workspaceId: true },
  });
  await prisma.workspace.deleteMany({
    where: {
      id: { in: [...new Set(members.map(member => member.workspaceId))] },
    },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

afterAll(async () => prisma.$disconnect());

// ==================== CONTEXT ====================

describe('channel message context', () => {
  it('returns a bounded ordered window and continues pagination in both directions', async () => {
    const owner = await createUser();
    const headers = authorization(owner.accessToken);
    const workspace = await request(app)
      .post('/workspaces')
      .set(headers)
      .send({ name: 'Context workspace' });
    const workspaceId = (workspace.body as { data: { id: string } }).data.id;
    const channelsUrl = `/workspaces/${workspaceId}/channels`;
    const channels = await request(app).get(channelsUrl).set(headers);
    const channelId = (channels.body as { data: { id: string }[] }).data[0]!.id;
    const messagesUrl = `${channelsUrl}/${channelId}/messages`;
    const authorId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: owner.email },
      })
    ).id;
    const records = Array.from({ length: 80 }, (_, index) => ({
      id: randomUUID(),
      channelId,
      authorId,
      content: `context ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 5))),
    }));
    await prisma.message.createMany({ data: records });
    const expected = [...records].sort(
      (left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() ||
        left.id.localeCompare(right.id)
    );
    const getContext = async (id: string) => {
      const response = await request(app)
        .get(`${messagesUrl}/${id}/context`)
        .set(headers);
      expect(response.status).toBe(200);
      return (response.body as Page).data;
    };
    for (const index of [0, 40, 79]) {
      const context = await getContext(expected[index]!.id);
      expect(context.targetMessageId).toBe(expected[index]!.id);
      expect(context.items.map(item => item.id)).toEqual(
        expected.slice(Math.max(0, index - 15), index + 16).map(item => item.id)
      );
      expect(
        context.items.every(item => typeof item.receipt.read === 'boolean')
      ).toBe(true);
      expect(context.olderCursor === null).toBe(index === 0);
      expect(context.newerCursor === null).toBe(index === 79);
    }
    const middle = await getContext(expected[40]!.id);
    const older: string[] = [];
    let before = middle.olderCursor;
    while (before) {
      const response = await request(app)
        .get(messagesUrl)
        .set(headers)
        .query({ limit: 7, before });
      expect(response.status).toBe(200);
      const page = (response.body as Page).data;
      older.unshift(...page.items.map(item => item.id));
      before = page.nextCursor;
    }
    const newer: string[] = [];
    let after = middle.newerCursor;
    while (after) {
      const response = await request(app)
        .get(messagesUrl)
        .set(headers)
        .query({ limit: 7, after });
      expect(response.status).toBe(200);
      const page = (response.body as Page).data;
      newer.push(...page.items.map(item => item.id));
      after = page.previousCursor;
    }
    expect([...older, ...middle.items.map(item => item.id), ...newer]).toEqual(
      expected.map(item => item.id)
    );
    const latest = await request(app)
      .get(messagesUrl)
      .set(headers)
      .query({ limit: 5 });
    expect((latest.body as Page).data.items.map(item => item.id)).toEqual(
      expected.slice(-5).map(item => item.id)
    );
    expect(
      (
        await request(app)
          .get(messagesUrl)
          .set(headers)
          .query({ before: middle.olderCursor, after: middle.newerCursor })
      ).status
    ).toBe(400);
    const search = await request(app)
      .get(`/workspaces/${workspaceId}/search/messages`)
      .set(headers)
      .query({ q: 'context 40' });
    expect(search.status).toBe(200);
    expect(search.body.data.items[0].message.id).toBe(records[40]!.id);
  });

  it('enforces workspace and channel boundaries and rejects missing targets', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const headers = authorization(owner.accessToken);
    const workspace = await request(app)
      .post('/workspaces')
      .set(headers)
      .send({ name: 'Context access' });
    const workspaceId = (workspace.body as { data: { id: string } }).data.id;
    const channelsUrl = `/workspaces/${workspaceId}/channels`;
    const channels = await request(app).get(channelsUrl).set(headers);
    const firstId = (channels.body as { data: { id: string }[] }).data[0]!.id;
    const second = await request(app)
      .post(channelsUrl)
      .set(headers)
      .send({ name: 'Second' });
    const secondId = (second.body as { data: { id: string } }).data.id;
    const message = await request(app)
      .post(`${channelsUrl}/${secondId}/messages`)
      .set(headers)
      .send({ content: 'target' });
    const messageId = (message.body as { data: { id: string } }).data.id;
    const other = await request(app)
      .post('/workspaces')
      .set(headers)
      .send({ name: 'Other context workspace' });
    const otherId = (other.body as { data: { id: string } }).data.id;
    const otherChannels = await request(app)
      .get(`/workspaces/${otherId}/channels`)
      .set(headers);
    const otherChannelId = (otherChannels.body as { data: { id: string }[] })
      .data[0]!.id;
    const context = (
      workspace: string,
      channel: string,
      target: string,
      token = owner.accessToken
    ) =>
      request(app)
        .get(
          `/workspaces/${workspace}/channels/${channel}/messages/${target}/context`
        )
        .set(authorization(token));
    for (const [response, code] of [
      [
        await context(workspaceId, secondId, messageId, outsider.accessToken),
        'WorkspaceNotFound',
      ],
      [
        await context(workspaceId, otherChannelId, messageId),
        'ChannelNotFound',
      ],
      [await context(workspaceId, firstId, messageId), 'MessageNotFound'],
      [await context(otherId, otherChannelId, messageId), 'MessageNotFound'],
      [await context(workspaceId, secondId, randomUUID()), 'MessageNotFound'],
    ] as const) {
      expect(response.status).toBe(404);
      expect((response.body as Page).messageType).toBe(code);
    }
    await request(app)
      .delete(`${channelsUrl}/${secondId}/messages/${messageId}`)
      .set(headers);
    const deleted = await context(workspaceId, secondId, messageId);
    expect(deleted.status).toBe(404);
    expect((deleted.body as Page).messageType).toBe('MessageNotFound');
  });
});
