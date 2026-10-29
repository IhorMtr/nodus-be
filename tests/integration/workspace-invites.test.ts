import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { authorization, createUser, testEmailPrefix } from './helpers.js';

type ApiBody<T> = { data: T; messageType: string | null };
type Invite = { id: string; token: string; expiresAt: string; status: string };

async function workspace(ownerToken: string): Promise<string> {
  const result = await request(app).post('/workspaces').set(authorization(ownerToken)).send({ name: 'Invite workspace' });
  expect(result.status).toBe(201);
  return (result.body as ApiBody<{ id: string }>).data.id;
}

async function invite(workspaceId: string, accessToken: string): Promise<Invite> {
  const result = await request(app).post(`/workspaces/${workspaceId}/invites`).set(authorization(accessToken));
  expect(result.status).toBe(201);
  return (result.body as ApiBody<Invite>).data;
}

beforeAll(async () => {
  const databaseName = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0] ?? '' : '';
  if (!databaseName.endsWith('_test')) throw new Error('Integration tests require a database ending in _test');
  await prisma.$connect();
});

afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: testEmailPrefix } }, select: { id: true } });
  const userIds = users.map(({ id }) => id);
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: { in: userIds } }, select: { workspaceId: true } });
  await prisma.$transaction(async (tx) => {
    await tx.workspace.deleteMany({ where: { id: { in: memberships.map(({ workspaceId }) => workspaceId) } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
});

afterAll(async () => { await prisma.$disconnect(); });

describe('workspace invites', () => {
  it('allows Owner and Admin but denies Member, stores only a hash, and expires after seven days', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: admin.email }, select: { id: true } })).id;
    const memberId = (await prisma.user.findUniqueOrThrow({ where: { email: member.email }, select: { id: true } })).id;
    await prisma.workspaceMember.createMany({ data: [{ workspaceId, userId: adminId, role: 'Admin' }, { workspaceId, userId: memberId, role: 'Member' }] });

    const first = await invite(workspaceId, owner.accessToken);
    await invite(workspaceId, admin.accessToken);
    const denied = await request(app).post(`/workspaces/${workspaceId}/invites`).set(authorization(member.accessToken));
    expect(denied.status).toBe(403);
    expect((denied.body as ApiBody<never>).messageType).toBe('InsufficientWorkspaceRole');

    const stored = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: first.id } });
    expect(stored.tokenHash).toBe(createHash('sha256').update(first.token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(first.token);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeGreaterThan(7 * 86400000 - 5000);
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBeLessThanOrEqual(7 * 86400000);
    const listed = await request(app).get(`/workspaces/${workspaceId}/invites`).set(authorization(owner.accessToken));
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).not.toContain(first.token);
    expect(JSON.stringify(listed.body)).not.toContain(stored.tokenHash);
  });

  it('resolves and accepts once, while an existing member does not consume the invite', async () => {
    const owner = await createUser();
    const joiner = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const created = await invite(workspaceId, owner.accessToken);
    const resolved = await request(app).post('/invites/resolve').send({ token: created.token });
    expect(resolved.status).toBe(200);
    expect((resolved.body as ApiBody<{ id: string }>).data.id).toBe(workspaceId);

    const existing = await request(app).post('/invites/accept').set(authorization(owner.accessToken)).send({ token: created.token });
    expect(existing.status).toBe(409);
    expect((existing.body as ApiBody<never>).messageType).toBe('AlreadyWorkspaceMember');
    expect((await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: created.id } })).usedAt).toBeNull();

    const accepted = await request(app).post('/invites/accept').set(authorization(joiner.accessToken)).send({ token: created.token });
    expect(accepted.status).toBe(200);
    const joinerId = (await prisma.user.findUniqueOrThrow({ where: { email: joiner.email }, select: { id: true } })).id;
    expect((await prisma.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId: joinerId } } })).role).toBe('Member');
    const reused = await request(app).post('/invites/accept').set(authorization(joiner.accessToken)).send({ token: created.token });
    expect(reused.status).toBe(409);
    expect((reused.body as ApiBody<never>).messageType).toBe('InviteAlreadyUsed');
  });

  it('allows only one concurrent acceptance and rejects revoked or expired invites', async () => {
    const owner = await createUser();
    const first = await createUser();
    const second = await createUser();
    const workspaceId = await workspace(owner.accessToken);
    const created = await invite(workspaceId, owner.accessToken);
    const results = await Promise.all([first, second].map((user) => request(app).post('/invites/accept').set(authorization(user.accessToken)).send({ token: created.token })));
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.workspaceMember.count({ where: { workspaceId } })).toBe(2);

    const revoked = await invite(workspaceId, owner.accessToken);
    expect((await request(app).delete(`/workspaces/${workspaceId}/invites/${revoked.id}`).set(authorization(owner.accessToken))).status).toBe(200);
    const rejected = await request(app).post('/invites/accept').set(authorization(second.accessToken)).send({ token: revoked.token });
    expect((rejected.body as ApiBody<never>).messageType).toBe('InviteRevoked');

    const expired = await invite(workspaceId, owner.accessToken);
    await prisma.workspaceInvite.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredResult = await request(app).post('/invites/resolve').send({ token: expired.token });
    expect((expiredResult.body as ApiBody<never>).messageType).toBe('InviteExpired');
  });
});
