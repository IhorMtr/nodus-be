import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { publishAnnouncementJob } from '../../src/modules/announcements/announcement.publisher.js';
import { announcementQueue } from '../../src/queues/announcement.queue.js';
import { closeRedis } from '../../src/redis/client.js';
import { socketPublisher } from '../../src/socket/socket.publisher.js';
import { notificationBridge } from '../../src/socket/notification.bridge.js';
import type { SocketServer } from '../../src/socket/socket.types.js';
import { authorization, createUser } from './helpers.js';

// ==================== FIXTURES ====================

let workspaceId: string;
let ownerId: string;
let memberId: string;
let outsiderId: string;
let ownerToken: string;
let memberToken: string;
let outsiderToken: string;

beforeAll(async () => {
  const name = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0]
    : '';
  if (!name?.endsWith('_test'))
    throw new Error('Integration tests require a test database');
  await prisma.$connect();
  const [owner, member, outsider] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
  ]);
  ownerToken = owner.accessToken;
  memberToken = member.accessToken;
  outsiderToken = outsider.accessToken;
  const users = await prisma.user.findMany({
    where: { email: { in: [owner.email, member.email, outsider.email] } },
    select: { id: true, email: true },
  });
  ownerId = users.find(user => user.email === owner.email)!.id;
  memberId = users.find(user => user.email === member.email)!.id;
  outsiderId = users.find(user => user.email === outsider.email)!.id;
  const response = await request(app)
    .post('/workspaces')
    .set(authorization(ownerToken))
    .send({ name: 'Notifications' });
  workspaceId = response.body.data.id as string;
  await prisma.workspaceMember.create({
    data: { workspaceId, userId: memberId },
  });
});

afterAll(async () => {
  vi.restoreAllMocks();
  await notificationBridge.close();
  if (workspaceId)
    await prisma.workspace.delete({ where: { id: workspaceId } });
  for (const id of [ownerId, memberId, outsiderId]) {
    if (id) await prisma.user.delete({ where: { id } });
  }
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
});

// ==================== TESTS ====================

describe('notifications', () => {
  it('persists immediate announcements, paginates, scopes access, and marks read', async () => {
    const publish = vi.spyOn(socketPublisher, 'publishNotificationCreated');
    for (const title of ['First', 'Second']) {
      const response = await request(app)
        .post(`/workspaces/${workspaceId}/announcements`)
        .set(authorization(ownerToken))
        .send({ title, content: 'Content' });
      expect(response.status).toBe(201);
    }
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[0].userId).toBe(memberId);
    const firstPage = await request(app)
      .get('/notifications?page=1&limit=1')
      .set(authorization(memberToken));
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.total).toBe(2);
    expect(firstPage.body.data.items).toHaveLength(1);
    const secondPage = await request(app)
      .get('/notifications?page=2&limit=1')
      .set(authorization(memberToken));
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.items[0].id).not.toBe(
      firstPage.body.data.items[0].id
    );
    expect(
      (
        await request(app)
          .get('/notifications/unread-count')
          .set(authorization(memberToken))
      ).body.data.count
    ).toBe(2);
    expect(
      (await request(app).get('/notifications').set(authorization(ownerToken)))
        .body.data.total
    ).toBe(0);
    expect(
      (
        await request(app)
          .get('/notifications')
          .set(authorization(outsiderToken))
      ).body.data.total
    ).toBe(0);
    const id = firstPage.body.data.items[0].id as string;
    expect(
      (
        await request(app)
          .patch(`/notifications/${id}/read`)
          .set(authorization(outsiderToken))
      ).status
    ).toBe(404);
    const marked = await request(app)
      .patch(`/notifications/${id}/read`)
      .set(authorization(memberToken));
    expect(marked.status).toBe(200);
    expect(marked.body.data.readAt).not.toBeNull();
    expect(
      (
        await request(app)
          .post('/notifications/read-all')
          .set(authorization(memberToken))
      ).body.data.updatedCount
    ).toBe(1);
    expect(
      (
        await request(app)
          .get('/notifications/unread-count')
          .set(authorization(memberToken))
      ).body.data.count
    ).toBe(0);
    publish.mockRestore();
  });

  it('creates scheduled notifications only when publishing and deduplicates retries', async () => {
    const announcement = await prisma.announcement.create({
      data: {
        workspaceId,
        authorId: ownerId,
        title: 'Scheduled',
        content: 'Later',
        publishAt: new Date(Date.now() - 1000),
      },
    });
    expect(
      await prisma.notification.count({ where: { entityId: announcement.id } })
    ).toBe(0);
    expect(
      await publishAnnouncementJob({
        announcementId: announcement.id,
        scheduleVersion: 0,
      })
    ).toBe(true);
    expect(
      await publishAnnouncementJob({
        announcementId: announcement.id,
        scheduleVersion: 0,
      })
    ).toBe(false);
    expect(
      await prisma.notification.count({
        where: { entityId: announcement.id, userId: memberId },
      })
    ).toBe(1);
  });

  it('notifies on role change and removal', async () => {
    const role = await request(app)
      .patch(`/workspaces/${workspaceId}/members/${memberId}/role`)
      .set(authorization(ownerToken))
      .send({ role: 'Admin' });
    expect(role.status).toBe(200);
    expect(
      await prisma.notification.count({
        where: { userId: memberId, type: 'WorkspaceRoleChanged' },
      })
    ).toBe(1);
    const removed = await request(app)
      .delete(`/workspaces/${workspaceId}/members/${memberId}`)
      .set(authorization(ownerToken));
    expect(removed.status).toBe(200);
    expect(
      await prisma.notification.count({
        where: { userId: memberId, type: 'WorkspaceRemoved' },
      })
    ).toBe(1);
    expect(
      (
        await request(app).get('/notifications').set(authorization(memberToken))
      ).body.data.items.some(
        (item: { type: string }) => item.type === 'WorkspaceRemoved'
      )
    ).toBe(true);
  });

  it('forwards standalone worker notifications through Redis to the user room', async () => {
    const record = await prisma.notification.findFirstOrThrow({
      where: { userId: memberId },
    });
    const received = new Promise<{ room: string; event: string; id: string }>(
      resolve => {
        socketPublisher.bind({
          to: (room: string) => ({
            emit: (event: string, payload: { id: string }) =>
              resolve({ room, event, id: payload.id }),
          }),
        } as unknown as SocketServer);
      }
    );
    await notificationBridge.start();
    await notificationBridge.publish({
      id: record.id,
      userId: record.userId,
      workspaceId: record.workspaceId,
      type: record.type,
      entityId: record.entityId,
      title: record.title,
      message: record.message,
      readAt: record.readAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
    });
    expect(
      await Promise.race([
        received,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Notification event timed out')),
            2000
          )
        ),
      ])
    ).toEqual({
      room: `user:${memberId}`,
      event: 'notification:created',
      id: record.id,
    });
  });
});
