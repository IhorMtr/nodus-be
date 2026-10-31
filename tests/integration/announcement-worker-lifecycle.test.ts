import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/database/client.js';
import {
  announcementQueue,
  enqueueAnnouncement,
} from '../../src/queues/announcement.queue.js';
import { closeRedis } from '../../src/redis/client.js';
import { announcementWorker } from '../../src/workers/announcements.lifecycle.js';

// ==================== FIXTURES ====================

let userId: string;
let workspaceId: string;

// ==================== SETUP AND CLEANUP ====================

beforeAll(async () => {
  const databaseName = process.env.DATABASE_URL
    ? (new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0] ?? '')
    : '';
  if (!databaseName.endsWith('_test'))
    throw new Error('Integration tests require a database ending in _test');
  await Promise.all([prisma.$connect(), announcementQueue.waitUntilReady()]);
  const user = await prisma.user.create({
    data: {
      firstName: 'Worker',
      lastName: 'Test',
      email: `worker-${randomUUID()}@example.test`,
      passwordHash: 'worker-test',
    },
  });
  userId = user.id;
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Worker lifecycle test',
      members: { create: { userId, role: 'Owner' } },
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  await announcementWorker.close();
  if (workspaceId)
    await prisma.workspace.delete({ where: { id: workspaceId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await announcementQueue.close();
  await closeRedis();
  await prisma.$disconnect();
});

// ==================== TESTS ====================

describe('announcement worker lifecycle', () => {
  it('starts once, publishes a delayed job, and closes idempotently', async () => {
    const workersBefore = (await announcementQueue.getWorkers()).length;
    await Promise.all([announcementWorker.start(), announcementWorker.start()]);
    expect((await announcementQueue.getWorkers()).length).toBe(
      workersBefore + 1
    );

    const publishAt = new Date(Date.now() + 1000);
    const announcement = await prisma.announcement.create({
      data: {
        workspaceId,
        authorId: userId,
        title: 'Worker lifecycle',
        content: 'Scheduled publication',
        publishAt,
      },
    });
    await enqueueAnnouncement(announcement.id, 0, publishAt);

    let published = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const row = await prisma.announcement.findUniqueOrThrow({
        where: { id: announcement.id },
      });
      if (row.publishedAt) {
        published = true;
        break;
      }
      await delay(200);
    }
    expect(published).toBe(true);

    await Promise.all([announcementWorker.close(), announcementWorker.close()]);
    expect((await announcementQueue.getWorkers()).length).toBe(workersBefore);
  });
});
