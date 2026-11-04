import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { presenceService } from '../../src/modules/presence/presence.service.js';
import { announcementQueue } from '../../src/queues/announcement.queue.js';
import { closeRedis } from '../../src/redis/client.js';
import { initializeSocket } from '../../src/socket/index.js';
import { conversationRoom, userRoom } from '../../src/socket/socket.rooms.js';
import type { SocketServer } from '../../src/socket/socket.types.js';
import { authorization, createUser, assertTestDatabase } from './helpers.js';

// ==================== FIXTURES ====================

let workspaceId: string;
let ownerId: string;
let memberId: string;
let outsiderId: string;
let bystanderId: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let bystanderToken: string;
let conversationId: string;
let httpServer: HttpServer;
let socketServer: SocketServer;
let address: string;
const sockets: Socket[] = [];

const conversationsUrl = () => `/workspaces/${workspaceId}/conversations`;
const messagesUrl = () => `${conversationsUrl()}/${conversationId}/messages`;
const auth = (token: string) => authorization(token);

async function openSocket(token: string): Promise<Socket> {
  const socket = connectSocket(address, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

async function awaitEvent(events: unknown[], count: number): Promise<void> {
  for (let i = 0; i < 30 && events.length < count; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(events).toHaveLength(count);
}

beforeAll(async () => {
  assertTestDatabase();
  await prisma.$connect();
  const [owner, member, outsider, bystander] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);
  ownerToken = owner.accessToken;
  memberToken = member.accessToken;
  outsiderToken = outsider.accessToken;
  bystanderToken = bystander.accessToken;
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: [owner.email, member.email, outsider.email, bystander.email],
      },
    },
  });
  ownerId = users.find(user => user.email === owner.email)!.id;
  memberId = users.find(user => user.email === member.email)!.id;
  outsiderId = users.find(user => user.email === outsider.email)!.id;
  bystanderId = users.find(user => user.email === bystander.email)!.id;
  const response = await request(app)
    .post('/workspaces')
    .set(auth(ownerToken))
    .send({ name: 'Direct messages' });
  workspaceId = response.body.data.id as string;
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: memberId },
  });
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: bystanderId },
  });
  httpServer = createServer(app);
  socketServer = initializeSocket(httpServer);
  await presenceService.start();
  await new Promise<void>(resolve =>
    httpServer.listen(0, '127.0.0.1', resolve)
  );
  const bound = httpServer.address();
  if (!bound || typeof bound === 'string') {
    throw new Error('No test port');
  }
  address = `http://127.0.0.1:${bound.port}`;
});

afterAll(async () => {
  sockets.forEach(socket => socket.disconnect());
  await presenceService.close();
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
  await prisma.workspace.delete({ where: { id: workspaceId } });
  await prisma.user.deleteMany({
    where: { id: { in: [ownerId, memberId, outsiderId, bystanderId] } },
  });
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
  socketServer.close();
});

// ==================== CONVERSATIONS ====================

describe('direct conversations', () => {
  it('rejects self, outsiders, and nonmembers, and creates one row under concurrent requests', async () => {
    expect(
      (
        await request(app)
          .post(conversationsUrl())
          .set(auth(ownerToken))
          .send({ userId: ownerId })
      ).status
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(conversationsUrl())
          .set(auth(ownerToken))
          .send({ userId: outsiderId })
      ).status
    ).toBe(404);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(outsiderToken)))
        .status
    ).toBe(404);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        request(app)
          .post(conversationsUrl())
          .set(auth(i % 2 ? memberToken : ownerToken))
          .send({ userId: i % 2 ? ownerId : memberId })
      )
    );
    expect(results.filter(result => result.status === 201)).toHaveLength(1);
    expect(results.filter(result => result.status === 200)).toHaveLength(7);
    const ids = results.map(result => result.body.data.id as string);
    expect(new Set(ids).size).toBe(1);
    conversationId = ids[0]!;
    expect(await prisma.conversation.count({ where: { workspaceId } })).toBe(1);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(bystanderToken)))
        .body.data
    ).toEqual([]);
    expect(
      (await request(app).get(messagesUrl()).set(auth(bystanderToken))).status
    ).toBe(404);
  });

  it('lists only participants and includes other user, presence, latest message, and unread state', async () => {
    const ownerSocket = await openSocket(ownerToken);
    const response = await request(app)
      .get(conversationsUrl())
      .set(auth(memberToken));
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].otherUser.id).toBe(ownerId);
    expect(response.body.data[0].otherUser.status).toBe('online');
    expect(response.body.data[0].unreadCount).toBe(0);
    ownerSocket.disconnect();
  });

  it('sends, edits, deletes, paginates, notifies recipient, and preserves read position after deletion', async () => {
    const first = await request(app)
      .post(messagesUrl())
      .set(auth(ownerToken))
      .send({ content: 'First' });
    const second = await request(app)
      .post(messagesUrl())
      .set(auth(ownerToken))
      .send({ content: 'Second' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstId = first.body.data.id as string;
    const secondId = second.body.data.id as string;
    const notifications = await prisma.notification.findMany({
      where: { workspaceId, type: 'DirectMessageCreated' },
    });
    expect(notifications).toHaveLength(2);
    expect(
      notifications.every(notification => notification.userId === memberId)
    ).toBe(true);
    expect(
      new Set(notifications.map(notification => notification.entityId))
    ).toEqual(new Set([firstId, secondId]));
    const page = await request(app)
      .get(`${messagesUrl()}?limit=1`)
      .set(auth(memberToken));
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(1);
    const older = await request(app)
      .get(
        `${messagesUrl()}?limit=1&before=${page.body.data.nextCursor as string}`
      )
      .set(auth(memberToken));
    expect(older.body.data.items).toHaveLength(1);
    expect(older.body.data.items[0].id).not.toBe(page.body.data.items[0].id);
    const forward = await request(app)
      .get(`${messagesUrl()}?after=${page.body.data.nextCursor as string}`)
      .set(auth(memberToken));
    expect(forward.status).toBe(400);
    expect(forward.body.messageType).toBe('ValidationFailed');
    expect(
      (
        await request(app)
          .patch(`${messagesUrl()}/${firstId}`)
          .set(auth(memberToken))
          .send({ content: 'No' })
      ).status
    ).toBe(403);
    const edited = await request(app)
      .patch(`${messagesUrl()}/${firstId}`)
      .set(auth(ownerToken))
      .send({ content: 'Edited' });
    expect(edited.body.data.content).toBe('Edited');
    const read = await request(app)
      .put(`${conversationsUrl()}/${conversationId}/read-state`)
      .set(auth(memberToken))
      .send({ lastReadMessageId: firstId });
    expect(read.status).toBe(200);
    expect(read.body.data.lastReadMessageId).toBe(firstId);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(memberToken))).body
        .data[0].unreadCount
    ).toBe(1);
    expect(
      (
        await request(app)
          .delete(`${messagesUrl()}/${firstId}`)
          .set(auth(memberToken))
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .delete(`${messagesUrl()}/${firstId}`)
          .set(auth(ownerToken))
      ).status
    ).toBe(200);
    const state = await prisma.conversationReadState.findUniqueOrThrow({
      where: { userId_conversationId: { userId: memberId, conversationId } },
    });
    expect(state.lastReadMessageId).toBe(firstId);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(memberToken))).body
        .data[0].unreadCount
    ).toBe(1);
    expect(
      (
        await request(app)
          .put(`${conversationsUrl()}/${conversationId}/read-state`)
          .set(auth(memberToken))
          .send({ lastReadMessageId: secondId })
      ).status
    ).toBe(200);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(memberToken))).body
        .data[0].hasUnread
    ).toBe(false);
    expect(
      await prisma.notification.count({
        where: { workspaceId, type: 'DirectMessageCreated' },
      })
    ).toBe(2);
  });

  it('checks join permissions, delivers realtime, and allows rejoin after reconnect', async () => {
    const owner = await openSocket(ownerToken);
    const member = await openSocket(memberToken);
    const outsider = await openSocket(outsiderToken);
    const bystander = await openSocket(bystanderToken);
    const subscription = { workspaceId, conversationId };
    expect(
      (
        (await outsider.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(false);
    expect(
      (
        (await bystander.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(false);
    expect(
      (
        (await owner.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(true);
    expect(
      (
        (await member.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(true);
    const events: unknown[] = [];
    const updates: unknown[] = [];
    const deletions: unknown[] = [];
    member.on('direct-message:created', payload => events.push(payload));
    member.on('direct-message:updated', payload => updates.push(payload));
    member.on('direct-message:deleted', payload => deletions.push(payload));
    const sent = await request(app)
      .post(messagesUrl())
      .set(auth(ownerToken))
      .send({ content: 'Realtime' });
    expect(sent.status).toBe(201);
    await awaitEvent(events, 1);
    const messageId = sent.body.data.id as string;
    expect(
      (
        await request(app)
          .patch(`${messagesUrl()}/${messageId}`)
          .set(auth(ownerToken))
          .send({ content: 'Realtime edited' })
      ).status
    ).toBe(200);
    await awaitEvent(updates, 1);
    expect(
      (
        await request(app)
          .delete(`${messagesUrl()}/${messageId}`)
          .set(auth(ownerToken))
      ).status
    ).toBe(200);
    await awaitEvent(deletions, 1);
    member.disconnect();
    const reconnected = await openSocket(memberToken);
    const nextEvents: unknown[] = [];
    reconnected.on('direct-message:created', payload =>
      nextEvents.push(payload)
    );
    expect(
      (
        (await reconnected.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(true);
    await request(app)
      .post(messagesUrl())
      .set(auth(ownerToken))
      .send({ content: 'After reconnect' });
    await awaitEvent(nextEvents, 1);
    expect(
      (
        await request(app).get(messagesUrl()).set(auth(memberToken))
      ).body.data.items.at(-1).content
    ).toBe('After reconnect');
    owner.disconnect();
    reconnected.disconnect();
    outsider.disconnect();
    bystander.disconnect();
  });

  it('uses message id to break equal timestamp ties in history and unread counts', async () => {
    const ids: string[] = [];
    for (const content of ['Tied one', 'Tied two']) {
      const response = await request(app)
        .post(messagesUrl())
        .set(auth(ownerToken))
        .send({ content });
      expect(response.status).toBe(201);
      ids.push(response.body.data.id as string);
    }
    await prisma.directMessage.updateMany({
      where: { id: { in: ids } },
      data: { createdAt: new Date('2030-01-01T00:00:00.000Z') },
    });
    const [older, newer] = [...ids].sort() as [string, string];
    const firstPage = await request(app)
      .get(`${messagesUrl()}?limit=1`)
      .set(auth(memberToken));
    expect(firstPage.body.data.items[0].id).toBe(newer);
    const nextPage = await request(app)
      .get(
        `${messagesUrl()}?limit=1&before=${firstPage.body.data.nextCursor as string}`
      )
      .set(auth(memberToken));
    expect(nextPage.body.data.items[0].id).toBe(older);
    expect(
      (
        await request(app)
          .put(`${conversationsUrl()}/${conversationId}/read-state`)
          .set(auth(memberToken))
          .send({ lastReadMessageId: older })
      ).status
    ).toBe(200);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(memberToken))).body
        .data[0].unreadCount
    ).toBe(1);
    expect(
      (
        await request(app)
          .put(`${conversationsUrl()}/${conversationId}/read-state`)
          .set(auth(memberToken))
          .send({ lastReadMessageId: newer })
      ).status
    ).toBe(200);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(memberToken))).body
        .data[0].unreadCount
    ).toBe(0);
  });

  it('returns persistent receipts and marks only confirmed direct notifications read', async () => {
    const other = await request(app)
      .post(conversationsUrl())
      .set(auth(ownerToken))
      .send({ userId: bystanderId });
    expect(other.status).toBe(201);
    const otherId = other.body.data.id as string;
    const otherMessage = await request(app)
      .post(`${conversationsUrl()}/${otherId}/messages`)
      .set(auth(ownerToken))
      .send({ content: 'Other conversation' });
    const sent = await request(app)
      .post(messagesUrl())
      .set(auth(ownerToken))
      .send({ content: 'Receipt target' });
    const messageId = sent.body.data.id as string;
    await prisma.directMessage.update({
      where: { id: messageId },
      data: { createdAt: new Date('2031-01-01T00:00:00.000Z') },
    });
    const before = await request(app).get(messagesUrl()).set(auth(ownerToken));
    expect(
      before.body.data.items.find(
        (item: { id: string }) => item.id === messageId
      ).read
    ).toBe(false);
    const memberSocket = await openSocket(memberToken);
    const ownerSocket = await openSocket(ownerToken);
    const ownerOtherDevice = await openSocket(ownerToken);
    const receipts: unknown[] = [];
    const otherDeviceReceipts: unknown[] = [];
    const changes: unknown[] = [];
    ownerSocket.on('direct-message:read', event => receipts.push(event));
    ownerOtherDevice.on('direct-message:read', event =>
      otherDeviceReceipts.push(event)
    );
    memberSocket.on('notifications:read', event => changes.push(event));
    await memberSocket.emitWithAck('conversation:join', {
      workspaceId,
      conversationId,
    });
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { entityId: messageId },
        })
      ).readAt
    ).toBeNull();
    const marked = await request(app)
      .put(`${conversationsUrl()}/${conversationId}/read-state`)
      .set(auth(memberToken))
      .send({ lastReadMessageId: messageId });
    expect(marked.status).toBe(200);
    await awaitEvent(receipts, 1);
    await awaitEvent(otherDeviceReceipts, 1);
    await awaitEvent(changes, 1);
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { entityId: messageId },
        })
      ).readAt
    ).not.toBeNull();
    expect(
      (
        await prisma.notification.findFirstOrThrow({
          where: { entityId: otherMessage.body.data.id as string },
        })
      ).readAt
    ).toBeNull();
    const after = await request(app).get(messagesUrl()).set(auth(ownerToken));
    expect(
      after.body.data.items.find(
        (item: { id: string }) => item.id === messageId
      ).read
    ).toBe(true);
    expect(
      (
        await request(app)
          .put(`${conversationsUrl()}/${conversationId}/read-state`)
          .set(auth(memberToken))
          .send({ lastReadMessageId: messageId })
      ).body.data.lastReadMessageId
    ).toBe(messageId);
    memberSocket.disconnect();
    ownerSocket.disconnect();
    ownerOtherDevice.disconnect();
    await prisma.conversation.delete({ where: { id: otherId } });
  });

  it('revokes REST and socket access when membership is removed', async () => {
    const member = await openSocket(memberToken);
    const subscription = { workspaceId, conversationId };
    expect(
      (
        (await member.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(true);
    const removed = await request(app)
      .delete(`/workspaces/${workspaceId}/members/${memberId}`)
      .set(auth(ownerToken));
    expect(removed.status).toBe(200);
    const connected = await socketServer.in(userRoom(memberId)).fetchSockets();
    expect(
      connected.every(
        socket =>
          !socket.rooms.has(conversationRoom(workspaceId, conversationId))
      )
    ).toBe(true);
    expect(
      (await request(app).get(messagesUrl()).set(auth(memberToken))).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post(messagesUrl())
          .set(auth(ownerToken))
          .send({ content: 'Denied' })
      ).status
    ).toBe(404);
    expect(
      (
        (await member.emitWithAck('conversation:join', subscription)) as {
          success: boolean;
        }
      ).success
    ).toBe(false);
    expect(
      (await request(app).get(conversationsUrl()).set(auth(ownerToken))).body
        .data
    ).toHaveLength(1);
    expect(
      await prisma.directMessage.count({ where: { conversationId } })
    ).toBeGreaterThan(0);
    expect(
      await prisma.conversationReadState.count({
        where: { conversationId, userId: memberId },
      })
    ).toBe(0);
    member.disconnect();
  });

  it('cascades conversations and history when a workspace is deleted', async () => {
    const created = await request(app)
      .post('/workspaces')
      .set(auth(ownerToken))
      .send({ name: 'Temporary direct workspace' });
    expect(created.status).toBe(201);
    const temporaryWorkspaceId = created.body.data.id as string;
    await prisma.workspaceMember.create({
      data: { workspaceId: temporaryWorkspaceId, userId: memberId },
    });
    const pair = await request(app)
      .post(`/workspaces/${temporaryWorkspaceId}/conversations`)
      .set(auth(ownerToken))
      .send({ userId: memberId });
    expect(pair.status).toBe(201);
    const temporaryConversationId = pair.body.data.id as string;
    expect(
      (
        await request(app)
          .post(
            `/workspaces/${temporaryWorkspaceId}/conversations/${temporaryConversationId}/messages`
          )
          .set(auth(ownerToken))
          .send({ content: 'Temporary' })
      ).status
    ).toBe(201);
    expect(
      (
        await request(app)
          .delete(`/workspaces/${temporaryWorkspaceId}`)
          .set(auth(ownerToken))
      ).status
    ).toBe(200);
    expect(
      await prisma.conversation.count({
        where: { id: temporaryConversationId },
      })
    ).toBe(0);
    expect(
      await prisma.directMessage.count({
        where: { conversationId: temporaryConversationId },
      })
    ).toBe(0);
    expect(
      (
        await request(app)
          .get(`/workspaces/${temporaryWorkspaceId}/conversations`)
          .set(auth(ownerToken))
      ).status
    ).toBe(404);
  });
});
