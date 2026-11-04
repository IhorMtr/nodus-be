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

type SearchBody = {
  data: {
    items: {
      message: { id: string; content: string; author: { id: string } };
      channel: { id: string; name: string };
    }[];
    nextCursor: string | null;
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

// ==================== SEARCH ====================

describe('workspace message search', () => {
  it('searches accessible channels, filters, validates, and paginates equal timestamps', async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const ownerAuth = authorization(owner.accessToken);
    const created = await request(app)
      .post('/workspaces')
      .set(ownerAuth)
      .send({ name: 'Search workspace' });
    expect(created.status).toBe(201);
    const workspaceId = (created.body as { data: { id: string } }).data.id;
    const memberId = (
      await prisma.user.findUniqueOrThrow({ where: { email: member.email } })
    ).id;
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: memberId, role: 'Member' },
    });
    const channelsUrl = `/workspaces/${workspaceId}/channels`;
    const initial = await request(app).get(channelsUrl).set(ownerAuth);
    const firstChannel = (
      initial.body as { data: { id: string; name: string }[] }
    ).data[0]!;
    const secondResponse = await request(app)
      .post(channelsUrl)
      .set(ownerAuth)
      .send({ name: 'second' });
    const secondChannel = (
      secondResponse.body as { data: { id: string; name: string } }
    ).data;
    const send = async (channelId: string, content: string) => {
      const result = await request(app)
        .post(`${channelsUrl}/${channelId}/messages`)
        .set(ownerAuth)
        .send({ content });
      expect(result.status).toBe(201);
      return (result.body as { data: { id: string } }).data.id;
    };
    const ids = [
      await send(firstChannel.id, 'Alpha exact word'),
      await send(secondChannel.id, 'aLpHa mixed CASE'),
      await send(firstChannel.id, 'preALPHAbet part'),
    ];
    await send(secondChannel.id, 'unrelated text');
    const literalId = await send(secondChannel.id, 'literal %foo marker');
    const deletedId = await send(firstChannel.id, 'alpha deleted');
    expect(
      (
        await request(app)
          .delete(`${channelsUrl}/${firstChannel.id}/messages/${deletedId}`)
          .set(ownerAuth)
      ).status
    ).toBe(200);
    await prisma.message.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const url = `/workspaces/${workspaceId}/search/messages`;
    const search = (token: string, params: Record<string, string>) =>
      request(app).get(url).set(authorization(token)).query(params);
    const all = await search(member.accessToken, { q: 'alpha' });
    expect(all.status).toBe(200);
    expect(
      (all.body as SearchBody).data.items.map(item => item.message.id)
    ).toEqual([...ids].sort().reverse());
    expect(
      (all.body as SearchBody).data.items.map(item => item.channel.id)
    ).toContain(secondChannel.id);
    expect(
      (all.body as SearchBody).data.items.every(
        item =>
          item.message.author.id.length > 0 && item.channel.name.length > 0
      )
    ).toBe(true);
    expect(
      (await search(owner.accessToken, { q: 'EXACT' })).body.data.items.map(
        (item: { message: { id: string } }) => item.message.id
      )
    ).toEqual([ids[0]]);
    expect(
      (await search(owner.accessToken, { q: 'phabet' })).body.data.items.map(
        (item: { message: { id: string } }) => item.message.id
      )
    ).toEqual([ids[2]]);
    expect(
      (
        await search(owner.accessToken, {
          q: 'alpha',
          channelId: firstChannel.id,
        })
      ).body.data.items.map(
        (item: { message: { id: string } }) => item.message.id
      )
    ).toEqual([ids[0], ids[2]].sort().reverse());
    expect(
      (await search(owner.accessToken, { q: 'nonesuch' })).body.data
    ).toEqual({ items: [], nextCursor: null });
    expect(
      (await search(owner.accessToken, { q: '%foo' })).body.data.items.map(
        (item: { message: { id: string } }) => item.message.id
      )
    ).toEqual([literalId]);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await search(owner.accessToken, {
        q: 'alpha',
        limit: '1',
        ...(cursor ? { cursor } : {}),
      });
      expect(response.status).toBe(200);
      const body = response.body as SearchBody;
      seen.push(...body.data.items.map(item => item.message.id));
      cursor = body.data.nextCursor;
    } while (cursor);
    expect(seen).toEqual([...ids].sort().reverse());
    for (const params of [
      { q: 'ab' },
      { q: '   ' },
      { q: 'a'.repeat(201) },
      { q: 'alpha', cursor: 'bad!' },
      { q: 'alpha', limit: '0' },
    ]) {
      const response = await search(owner.accessToken, params);
      expect(response.status).toBe(400);
      expect(response.body.messageType).toBe('ValidationFailed');
    }
    expect(
      (await search(outsider.accessToken, { q: 'alpha' })).body.messageType
    ).toBe('WorkspaceNotFound');
    const adminId = (
      await prisma.user.findUniqueOrThrow({ where: { email: outsider.email } })
    ).id;
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: adminId, role: 'Admin' },
    });
    expect((await search(outsider.accessToken, { q: 'alpha' })).status).toBe(
      200
    );
    const other = await request(app)
      .post('/workspaces')
      .set(ownerAuth)
      .send({ name: 'Other workspace' });
    const otherId = (other.body as { data: { id: string } }).data.id;
    const otherChannels = await request(app)
      .get(`/workspaces/${otherId}/channels`)
      .set(ownerAuth);
    const otherChannelId = (otherChannels.body as { data: { id: string }[] })
      .data[0]!.id;
    const otherMessage = await request(app)
      .post(`/workspaces/${otherId}/channels/${otherChannelId}/messages`)
      .set(ownerAuth)
      .send({ content: 'alpha from another workspace' });
    expect(otherMessage.status).toBe(201);
    expect(
      (await search(owner.accessToken, { q: 'alpha' })).body.data.items.map(
        (item: { message: { id: string } }) => item.message.id
      )
    ).toEqual([...ids].sort().reverse());
    expect(
      (
        await search(owner.accessToken, {
          q: 'alpha',
          channelId: otherChannelId,
        })
      ).body.messageType
    ).toBe('ChannelNotFound');
    expect(
      (
        await request(app)
          .get(`${channelsUrl}/${firstChannel.id}/messages`)
          .set(ownerAuth)
      ).status
    ).toBe(200);
    expect((await request(app).get(channelsUrl).set(ownerAuth)).status).toBe(
      200
    );
  });
});
