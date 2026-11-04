import { createServer, type Server as HttpServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { presenceService } from '../../src/modules/presence/presence.service.js';
import { announcementQueue } from '../../src/queues/announcement.queue.js';
import { closeRedis } from '../../src/redis/client.js';
import { redis } from '../../src/redis/client.js';
import { initializeSocket } from '../../src/socket/index.js';
import type { SocketServer } from '../../src/socket/socket.types.js';
import {
  authorization,
  createUser,
  loginUser,
  assertTestDatabase,
} from './helpers.js';

// ==================== FIXTURES ====================

let httpServer: HttpServer;
let socketServer: SocketServer;
let address: string;
let workspaceId: string;
let ownerId: string;
let memberId: string;
let outsiderId: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;
let ownerEmail: string;
const sockets: Socket[] = [];

async function openSocket(token: string): Promise<Socket> {
  const socket = connectSocket(address, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

async function memberStatus(token: string, userId: string): Promise<string> {
  const response = await request(app)
    .get(`/workspaces/${workspaceId}/members`)
    .set(authorization(token));
  expect(response.status).toBe(200);
  const members = response.body.data as { userId: string; status: string }[];
  return members.find(member => member.userId === userId)!.status;
}

async function expectStatus(
  token: string,
  userId: string,
  expected: string
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if ((await memberStatus(token, userId)) === expected) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect(await memberStatus(token, userId)).toBe(expected);
}

async function expectEvent(
  events: { userId: string; status: string }[],
  userId: string,
  status: string
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (
      events.some(event => event.userId === userId && event.status === status)
    ) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  expect(events).toContainEqual({ userId, status });
}

beforeAll(async () => {
  assertTestDatabase();
  await prisma.$connect();
  const [owner, member, outsider] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
  ]);
  ownerToken = owner.accessToken;
  memberToken = member.accessToken;
  outsiderToken = outsider.accessToken;
  ownerEmail = owner.email;
  const users = await prisma.user.findMany({
    where: { email: { in: [owner.email, member.email, outsider.email] } },
  });
  ownerId = users.find(user => user.email === owner.email)!.id;
  memberId = users.find(user => user.email === member.email)!.id;
  outsiderId = users.find(user => user.email === outsider.email)!.id;
  const workspace = await request(app)
    .post('/workspaces')
    .set(authorization(ownerToken))
    .send({ name: 'Presence' });
  workspaceId = workspace.body.data.id as string;
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: memberId },
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
  for (const socket of sockets) {
    socket.disconnect();
  }
  await presenceService.close();
  await new Promise<void>(resolve => httpServer.close(() => resolve()));
  await prisma.workspace.delete({ where: { id: workspaceId } });
  for (const id of [ownerId, memberId, outsiderId]) {
    await prisma.user.delete({ where: { id } });
  }
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
});

// ==================== PRESENCE LIFECYCLE ====================

describe('presence', () => {
  it('counts sockets, restores saved status, and limits realtime recipients', async () => {
    const memberSocket = await openSocket(memberToken);
    const outsiderSocket = await openSocket(outsiderToken);
    const memberEvents: { userId: string; status: string }[] = [];
    const outsiderEvents: { userId: string; status: string }[] = [];
    memberSocket.on('presence:updated', event => memberEvents.push(event));
    outsiderSocket.on('presence:updated', event => outsiderEvents.push(event));

    const first = await openSocket(ownerToken);
    await expectStatus(memberToken, ownerId, 'online');
    await expectEvent(memberEvents, ownerId, 'online');
    expect(outsiderEvents.some(event => event.userId === ownerId)).toBe(false);

    const channelResponse = await request(app)
      .get(`/workspaces/${workspaceId}/channels`)
      .set(authorization(memberToken));
    const channelId = (channelResponse.body.data as { id: string }[])[0]!.id;
    const joined = await new Promise<{ success: boolean }>(resolve => {
      memberSocket.emit('channel:join', { workspaceId, channelId }, resolve);
    });
    expect(joined.success).toBe(true);
    const messageEvent = new Promise<{ message: { content: string } }>(
      resolve => {
        memberSocket.once('message:created', resolve);
      }
    );
    const sent = await request(app)
      .post(`/workspaces/${workspaceId}/channels/${channelId}/messages`)
      .set(authorization(ownerToken))
      .send({ content: 'Presence regression' });
    expect(sent.status).toBe(201);
    expect((await messageEvent).message.content).toBe('Presence regression');

    const second = await openSocket(ownerToken);
    await expectStatus(memberToken, ownerId, 'online');
    first.disconnect();
    await new Promise(resolve => setTimeout(resolve, 2700));
    expect(await memberStatus(memberToken, ownerId)).toBe('online');
    expect(
      memberEvents.some(
        event => event.userId === ownerId && event.status === 'offline'
      )
    ).toBe(false);

    for (const status of ['away', 'dnd'] as const) {
      const updated = await request(app)
        .patch('/users/me/status')
        .set(authorization(ownerToken))
        .send({ status });
      expect(updated.status).toBe(200);
      expect(updated.body.data.status).toBe(status);
      await expectStatus(memberToken, ownerId, status);
      await expectEvent(memberEvents, ownerId, status);
    }
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .presencePreference
    ).toBe('Dnd');
    const beforeBridge = memberEvents.length;
    await redis.publish(
      'nodus:presence:updated',
      JSON.stringify({
        userId: ownerId,
        status: 'dnd',
        origin: 'another-process',
      })
    );
    for (
      let attempt = 0;
      attempt < 30 && memberEvents.length === beforeBridge;
      attempt += 1
    ) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    expect(memberEvents.length).toBe(beforeBridge + 1);
    expect(outsiderEvents.some(event => event.userId === ownerId)).toBe(false);
    expect(
      (
        await request(app)
          .patch('/users/me/status')
          .set(authorization(ownerToken))
          .send({ status: 'offline' })
      ).status
    ).toBe(400);

    second.disconnect();
    await expectStatus(memberToken, ownerId, 'offline');
    await expectEvent(memberEvents, ownerId, 'offline');
    expect(outsiderEvents.some(event => event.userId === ownerId)).toBe(false);

    const refreshedToken = await loginUser(ownerEmail, 'TestPassword123');
    const reconnected = await openSocket(refreshedToken);
    await expectStatus(memberToken, ownerId, 'dnd');
    expect(
      memberEvents.filter(event => event.userId === ownerId).at(-1)
    ).toEqual({ userId: ownerId, status: 'dnd' });
    reconnected.disconnect();
    await expectStatus(memberToken, ownerId, 'offline');
    const reset = await request(app)
      .patch('/users/me/status')
      .set(authorization(ownerToken))
      .send({ status: 'online' });
    expect(reset.status).toBe(200);
    expect(reset.body.data.status).toBe('offline');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } }))
        .presencePreference
    ).toBe('Online');
  });

  it('clears active socket leases on graceful shutdown', async () => {
    expect(await memberStatus(ownerToken, memberId)).toBe('online');
    await socketServer.close();
    await presenceService.close();
    expect((await presenceService.get(memberId)).status).toBe('offline');
    expect((await presenceService.get(outsiderId)).status).toBe('offline');
  });
});
