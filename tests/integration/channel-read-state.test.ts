import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { authorization, createUser, testEmailPrefix } from './helpers.js';

// ==================== TYPES ====================

type ChannelData = { id: string; unreadCount: number; hasUnread: boolean };
type MessageData = { id: string };
type StateData = { lastReadMessageId: string; lastReadAt: string };

// ==================== DATABASE LIFECYCLE ====================

beforeAll(async () => {
  const databaseName = process.env.DATABASE_URL
    ? (new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0] ?? '')
    : '';
  if (!databaseName.endsWith('_test'))
    throw new Error('Test database required');
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

// ==================== READ STATE ====================

describe('channel read state', () => {
  it('uses message IDs to break equal timestamp ties', async () => {
    const user = await createUser();
    const created = await request(app)
      .post('/workspaces')
      .set(authorization(user.accessToken))
      .send({ name: 'Ties' });
    expect(created.status).toBe(201);
    const workspaceId = (created.body as { data: { id: string } }).data.id;
    const channelsUrl = `/workspaces/${workspaceId}/channels`;
    const channels = await request(app)
      .get(channelsUrl)
      .set(authorization(user.accessToken));
    const channelId = (channels.body as { data: ChannelData[] }).data[0]!.id;
    const messageIds: string[] = [];
    for (const content of ['one', 'two']) {
      const sent = await request(app)
        .post(`${channelsUrl}/${channelId}/messages`)
        .set(authorization(user.accessToken))
        .send({ content });
      expect(sent.status).toBe(201);
      messageIds.push((sent.body as { data: MessageData }).data.id);
    }
    await prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    });
    const [older, newer] = [...messageIds].sort() as [string, string];
    const marked = await request(app)
      .put(`${channelsUrl}/${channelId}/read-state`)
      .set(authorization(user.accessToken))
      .send({ lastReadMessageId: older });
    expect(marked.status).toBe(200);
    const after = await request(app)
      .get(channelsUrl)
      .set(authorization(user.accessToken));
    expect((after.body as { data: ChannelData[] }).data[0]!.unreadCount).toBe(
      1
    );
    const advanced = await request(app)
      .put(`${channelsUrl}/${channelId}/read-state`)
      .set(authorization(user.accessToken))
      .send({ lastReadMessageId: newer });
    expect(advanced.status).toBe(200);
    expect((advanced.body as { data: StateData }).data.lastReadMessageId).toBe(
      newer
    );
  });

  it('tracks independent monotonic boundaries and survives message deletion', async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const workspaceResponse = await request(app)
      .post('/workspaces')
      .set(authorization(owner.accessToken))
      .send({ name: 'Read state workspace' });
    expect(workspaceResponse.status).toBe(201);
    const workspaceId = (workspaceResponse.body as { data: { id: string } })
      .data.id;
    const ownerId = (
      await prisma.user.findUniqueOrThrow({ where: { email: owner.email } })
    ).id;
    const memberId = (
      await prisma.user.findUniqueOrThrow({ where: { email: member.email } })
    ).id;
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: memberId, role: 'Member' },
    });
    const channelsUrl = `/workspaces/${workspaceId}/channels`;
    const initial = await request(app)
      .get(channelsUrl)
      .set(authorization(owner.accessToken));
    expect(initial.status).toBe(200);
    const channelId = (initial.body as { data: ChannelData[] }).data[0]!.id;
    expect((initial.body as { data: ChannelData[] }).data[0]).toMatchObject({
      unreadCount: 0,
      hasUnread: false,
    });
    const messagesUrl = `${channelsUrl}/${channelId}/messages`;
    const send = async (token: string, content: string) => {
      const response = await request(app)
        .post(messagesUrl)
        .set(authorization(token))
        .send({ content });
      expect(response.status).toBe(201);
      return (response.body as { data: MessageData }).data.id;
    };
    const count = async (token: string) => {
      const response = await request(app)
        .get(channelsUrl)
        .set(authorization(token));
      expect(response.status).toBe(200);
      return (response.body as { data: ChannelData[] }).data[0]!.unreadCount;
    };
    const mark = (token: string, messageId: string) =>
      request(app)
        .put(`${channelsUrl}/${channelId}/read-state`)
        .set(authorization(token))
        .send({ lastReadMessageId: messageId });

    const first = await send(owner.accessToken, 'first');
    const second = await send(owner.accessToken, 'second');
    expect(await count(owner.accessToken)).toBe(2);
    expect(await count(member.accessToken)).toBe(2);
    const marked = await mark(owner.accessToken, first);
    expect(marked.status).toBe(200);
    expect((marked.body as { data: StateData }).data.lastReadMessageId).toBe(
      first
    );
    expect(await count(owner.accessToken)).toBe(1);
    expect((await mark(owner.accessToken, first)).body).toEqual(marked.body);
    const newer = await mark(owner.accessToken, second);
    expect(newer.status).toBe(200);
    expect((await mark(owner.accessToken, first)).body).toEqual(newer.body);
    expect(await count(owner.accessToken)).toBe(0);
    expect(await count(member.accessToken)).toBe(2);

    const third = await send(member.accessToken, 'third');
    const fourth = await send(member.accessToken, 'fourth');
    expect(await count(owner.accessToken)).toBe(2);
    expect((await mark(owner.accessToken, third)).status).toBe(200);
    expect(await count(owner.accessToken)).toBe(1);

    const foreign = await request(app)
      .post(channelsUrl)
      .set(authorization(owner.accessToken))
      .send({ name: 'Other' });
    expect(foreign.status).toBe(201);
    const foreignId = (foreign.body as { data: { id: string } }).data.id;
    const foreignMessage = await request(app)
      .post(`${channelsUrl}/${foreignId}/messages`)
      .set(authorization(owner.accessToken))
      .send({ content: 'foreign' });
    expect(
      (
        await mark(
          owner.accessToken,
          (foreignMessage.body as { data: MessageData }).data.id
        )
      ).body.messageType
    ).toBe('MessageNotFound');
    expect((await mark(outsider.accessToken, fourth)).body.messageType).toBe(
      'WorkspaceNotFound'
    );
    expect(
      (await mark(owner.accessToken, '00000000-0000-4000-8000-000000000000'))
        .body.messageType
    ).toBe('MessageNotFound');
    const secondWorkspace = await request(app)
      .post('/workspaces')
      .set(authorization(owner.accessToken))
      .send({ name: 'Another workspace' });
    const secondWorkspaceId = (secondWorkspace.body as { data: { id: string } })
      .data.id;
    const wrongWorkspace = await request(app)
      .put(`/workspaces/${secondWorkspaceId}/channels/${channelId}/read-state`)
      .set(authorization(owner.accessToken))
      .send({ lastReadMessageId: fourth });
    expect(wrongWorkspace.body.messageType).toBe('ChannelNotFound');

    expect(
      (
        await request(app)
          .delete(`${messagesUrl}/${third}`)
          .set(authorization(member.accessToken))
      ).status
    ).toBe(200);
    expect(await count(owner.accessToken)).toBe(1);
    const state = await prisma.channelReadState.findUniqueOrThrow({
      where: { userId_channelId: { userId: ownerId, channelId } },
    });
    expect(state.lastReadMessageId).toBe(third);

    expect(
      (
        await request(app)
          .delete(`${channelsUrl}/${channelId}`)
          .set(authorization(owner.accessToken))
      ).status
    ).toBe(200);
    expect(await prisma.channelReadState.count({ where: { channelId } })).toBe(
      0
    );
    expect(
      (
        await request(app)
          .get(`${channelsUrl}/${foreignId}`)
          .set(authorization(owner.accessToken))
      ).status
    ).toBe(200);
    expect(
      (
        await request(app)
          .put(`${channelsUrl}/${foreignId}/read-state`)
          .set(authorization(member.accessToken))
          .send({
            lastReadMessageId: (foreignMessage.body as { data: MessageData })
              .data.id,
          })
      ).status
    ).toBe(200);
    expect(
      await prisma.channelReadState.count({ where: { userId: memberId } })
    ).toBe(1);
    expect(
      (
        await request(app)
          .delete(`/workspaces/${workspaceId}/members/${memberId}`)
          .set(authorization(owner.accessToken))
      ).status
    ).toBe(200);
    expect(
      await prisma.channelReadState.count({ where: { userId: memberId } })
    ).toBe(0);
  });
});
