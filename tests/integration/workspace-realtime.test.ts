import { createServer, type Server as HttpServer } from 'node:http';
import { io as connectSocket, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { presenceService } from '../../src/modules/presence/presence.service.js';
import { announcementQueue } from '../../src/queues/announcement.queue.js';
import { closeRedis, redis } from '../../src/redis/client.js';
import { initializeSocket } from '../../src/socket/index.js';
import { notificationBridge } from '../../src/socket/notification.bridge.js';
import { socketPublisher } from '../../src/socket/socket.publisher.js';
import {
  channelRoom,
  conversationRoom,
  userRoom,
} from '../../src/socket/socket.rooms.js';
import type { SocketServer } from '../../src/socket/socket.types.js';
import {
  authorization,
  createUser,
  type TestUser,
  assertTestDatabase,
} from './helpers.js';

// ==================== TYPES ====================

type Ack = { success: boolean; messageType: string | null };
type Events = { revoked: unknown[]; messages: unknown[] };
type Participant = TestUser & { id: string };

// ==================== FIXTURES ====================

let httpServer: HttpServer;
let socketServer: SocketServer;
let address: string;
let owner: Participant;
let member: Participant;
let bystander: Participant;
const sockets: Socket[] = [];
const workspaceIds = new Set<string>();

// ==================== HELPERS ====================

async function participant(): Promise<Participant> {
  const user = await createUser();
  const { id } = await prisma.user.findUniqueOrThrow({
    where: { email: user.email },
    select: { id: true },
  });
  return { ...user, id };
}

async function createWorkspace(...members: Participant[]) {
  const created = await request(app)
    .post('/workspaces')
    .set(authorization(owner.accessToken))
    .send({ name: 'Realtime cleanup' });
  expect(created.status).toBe(201);
  const workspaceId = created.body.data.id as string;
  workspaceIds.add(workspaceId);
  for (const user of members) {
    await prisma.workspaceMember.create({
      data: { workspaceId, userId: user.id },
    });
  }
  const channels = await request(app)
    .get(`/workspaces/${workspaceId}/channels`)
    .set(authorization(owner.accessToken));
  return { workspaceId, channelId: channels.body.data[0].id as string };
}

async function createConversation(workspaceId: string, otherId: string) {
  const response = await request(app)
    .post(`/workspaces/${workspaceId}/conversations`)
    .set(authorization(owner.accessToken))
    .send({ userId: otherId });
  expect(response.status).toBe(201);
  return response.body.data.id as string;
}

async function openSocket(token: string): Promise<{ socket: Socket } & Events> {
  const socket = connectSocket(address, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  sockets.push(socket);
  const events: Events = { revoked: [], messages: [] };
  socket.on('workspace:access-revoked', payload =>
    events.revoked.push(payload)
  );
  socket.on('message:created', payload => events.messages.push(payload));
  socket.on('direct-message:created', payload => events.messages.push(payload));
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return { socket, ...events };
}

async function join(
  socket: Socket,
  event: 'channel:join' | 'conversation:join',
  payload: Record<string, string>
): Promise<void> {
  const ack = (await socket.emitWithAck(event, payload)) as Ack;
  expect(ack.success).toBe(true);
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 40 && !condition(); i += 1) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  expect(condition()).toBe(true);
}

const settle = () => new Promise(resolve => setTimeout(resolve, 200));

async function roomsOf(userId: string): Promise<Set<string>[]> {
  const connected = await socketServer.in(userRoom(userId)).fetchSockets();
  return connected.map(socket => socket.rooms);
}

function publishProbe(workspaceId: string, channelId: string): void {
  socketPublisher.publishMessageCreated(workspaceId, {
    id: '00000000-0000-4000-8000-000000000001',
    channelId,
    author: { id: owner.id, firstName: 'Test', lastName: 'User' },
    content: 'Probe',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

// ==================== SETUP ====================

beforeAll(async () => {
  assertTestDatabase();
  await prisma.$connect();
  [owner, member, bystander] = await Promise.all([
    participant(),
    participant(),
    participant(),
  ]);
  httpServer = createServer(app);
  socketServer = initializeSocket(httpServer);
  await presenceService.start();
  await notificationBridge.start();
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
  await prisma.workspace.deleteMany({
    where: { id: { in: [...workspaceIds] } },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, member.id, bystander.id] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, member.id, bystander.id] } },
  });
  await notificationBridge.close();
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
  socketServer.close();
});

// ==================== TESTS ====================

describe('workspace realtime cleanup', () => {
  it('revokes only the removed member and keeps other subscriptions', async () => {
    const { workspaceId, channelId } = await createWorkspace(member, bystander);
    const removed = await openSocket(member.accessToken);
    const staying = await openSocket(bystander.accessToken);
    await join(removed.socket, 'channel:join', { workspaceId, channelId });
    await join(staying.socket, 'channel:join', { workspaceId, channelId });

    const response = await request(app)
      .delete(`/workspaces/${workspaceId}/members/${member.id}`)
      .set(authorization(owner.accessToken));
    expect(response.status).toBe(200);

    await waitFor(() => removed.revoked.length === 1);
    expect(removed.revoked[0]).toEqual({ workspaceId });
    const room = channelRoom(workspaceId, channelId);
    expect((await roomsOf(member.id)).every(rooms => !rooms.has(room))).toBe(
      true
    );
    expect((await roomsOf(bystander.id)).every(rooms => rooms.has(room))).toBe(
      true
    );

    const sent = await request(app)
      .post(`/workspaces/${workspaceId}/channels/${channelId}/messages`)
      .set(authorization(owner.accessToken))
      .send({ content: 'After removal' });
    expect(sent.status).toBe(201);
    await waitFor(() => staying.messages.length === 1);
    await settle();
    expect(removed.messages).toHaveLength(0);
    expect(staying.revoked).toHaveLength(0);
    removed.socket.disconnect();
    staying.socket.disconnect();
  });

  it('revokes every former member on workspace deletion and keeps other workspaces', async () => {
    const deleted = await createWorkspace(member);
    const kept = await createWorkspace(member);
    const conversationId = await createConversation(
      deleted.workspaceId,
      member.id
    );
    const ownerSocket = await openSocket(owner.accessToken);
    const memberTab = await openSocket(member.accessToken);
    const memberDevice = await openSocket(member.accessToken);
    for (const client of [ownerSocket, memberTab, memberDevice]) {
      await join(client.socket, 'channel:join', deleted);
    }
    await join(memberTab.socket, 'conversation:join', {
      workspaceId: deleted.workspaceId,
      conversationId,
    });
    await join(memberDevice.socket, 'channel:join', kept);

    const response = await request(app)
      .delete(`/workspaces/${deleted.workspaceId}`)
      .set(authorization(owner.accessToken));
    expect(response.status).toBe(200);
    expect(
      await prisma.workspace.count({ where: { id: deleted.workspaceId } })
    ).toBe(0);

    for (const client of [ownerSocket, memberTab, memberDevice]) {
      await waitFor(() => client.revoked.length === 1);
      expect(client.revoked[0]).toEqual({ workspaceId: deleted.workspaceId });
    }
    const deletedRooms = [
      channelRoom(deleted.workspaceId, deleted.channelId),
      conversationRoom(deleted.workspaceId, conversationId),
    ];
    for (const rooms of [
      ...(await roomsOf(owner.id)),
      ...(await roomsOf(member.id)),
    ]) {
      expect(deletedRooms.some(room => rooms.has(room))).toBe(false);
    }

    publishProbe(deleted.workspaceId, deleted.channelId);
    const sent = await request(app)
      .post(
        `/workspaces/${kept.workspaceId}/channels/${kept.channelId}/messages`
      )
      .set(authorization(owner.accessToken))
      .send({ content: 'Still subscribed' });
    expect(sent.status).toBe(201);
    await waitFor(() => memberDevice.messages.length === 1);
    await settle();
    expect(memberDevice.messages).toEqual([
      expect.objectContaining({ workspaceId: kept.workspaceId }),
    ]);
    expect(ownerSocket.messages).toHaveLength(0);
    expect(memberTab.messages).toHaveLength(0);
    for (const client of [ownerSocket, memberTab, memberDevice]) {
      client.socket.disconnect();
    }
  });

  it('applies revocations forwarded by another API process through Redis', async () => {
    const { workspaceId, channelId } = await createWorkspace(member);
    const client = await openSocket(member.accessToken);
    await join(client.socket, 'channel:join', { workspaceId, channelId });

    await redis.publish(
      'nodus:notification:created',
      JSON.stringify({
        kind: 'workspace-revoked',
        origin: 'another-api-process',
        workspaceId,
        userIds: [member.id],
      })
    );

    await waitFor(() => client.revoked.length === 1);
    const room = channelRoom(workspaceId, channelId);
    expect((await roomsOf(member.id)).every(rooms => !rooms.has(room))).toBe(
      true
    );
    client.socket.disconnect();
  });

  it('delivers channel messages relayed by another API process', async () => {
    const { workspaceId, channelId } = await createWorkspace(member);
    const client = await openSocket(member.accessToken);
    await join(client.socket, 'channel:join', { workspaceId, channelId });

    const message = {
      id: '00000000-0000-4000-8000-000000000002',
      channelId,
      author: { id: owner.id, firstName: 'Test', lastName: 'User' },
      content: 'From another process',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await redis.publish(
      'nodus:notification:created',
      JSON.stringify({
        kind: 'message-created',
        origin: 'another-api-process',
        workspaceId,
        message,
      })
    );

    await waitFor(() => client.messages.length === 1);
    expect(client.messages[0]).toEqual({ workspaceId, message });
    client.socket.disconnect();
  });

  it('keeps a committed workspace deletion successful when realtime fails', async () => {
    const { workspaceId } = await createWorkspace(member);
    const revoke = vi
      .spyOn(socketPublisher, 'revokeWorkspaceAccess')
      .mockRejectedValueOnce(new Error('Realtime failure'));
    try {
      const response = await request(app)
        .delete(`/workspaces/${workspaceId}`)
        .set(authorization(owner.accessToken));
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(revoke).toHaveBeenCalledWith(
        workspaceId,
        expect.arrayContaining([owner.id, member.id])
      );
      expect(await prisma.workspace.count({ where: { id: workspaceId } })).toBe(
        0
      );
    } finally {
      revoke.mockRestore();
    }
  });
});
