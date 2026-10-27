import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/database/client.js';
import { createUser, loginUser, authorization, testEmailPrefix } from './helpers.js';

interface ApiBody<T> {
  data: T;
  messageType: string | null;
}

interface WorkspaceResponse {
  id: string;
  name: string;
  role: string;
}

// ==================== DATABASE LIFECYCLE ====================

beforeAll(async () => {
  const databaseName = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).pathname.slice(1).split('?')[0] ?? ''
    : '';
  if (!databaseName.endsWith('_test')) {
    throw new Error('Integration tests require a DATABASE_URL whose database name ends in _test');
  }
  await prisma.$connect();
});

afterEach(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: testEmailPrefix } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: { in: userIds } },
    select: { workspaceId: true },
  });
  const workspaceIds = [...new Set(memberships.map(({ workspaceId }) => workspaceId))];

  await prisma.$transaction(async (tx) => {
    await tx.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ==================== AUTHENTICATION ====================

describe('authentication API', () => {
  it('registers a user and returns access and refresh tokens', async () => {
    // Arrange
    const email = `${testEmailPrefix}register@example.test`;

    // Act
    const response = await request(app).post('/auth/register').send({
      firstName: 'Ada', lastName: 'Lovelace', email, password: 'TestPassword123', confirmPassword: 'TestPassword123',
    });

    // Assert
    expect(response.status).toBe(201);
    const body = response.body as unknown as ApiBody<{ accessToken: string; refreshToken: string }>;
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
  });

  it('logs in with valid credentials', async () => {
    // Arrange
    const user = await createUser();

    // Act
    const accessToken = await loginUser(user.email, user.password);

    // Assert
    expect(accessToken).toEqual(expect.any(String));
  });

  it('rejects login with an incorrect password', async () => {
    // Arrange
    const user = await createUser();

    // Act
    const response = await request(app).post('/auth/login').send({ email: user.email, password: 'WrongPassword1' });

    // Assert
    expect(response.status).toBe(401);
    const body = response.body as unknown as ApiBody<never>;
    expect(body.messageType).toBe('InvalidCredentials');
  });
});

// ==================== AUTHORIZATION ====================

describe('protected workspace API', () => {
  it('rejects access to a protected endpoint without a token', async () => {
    // Arrange
    await createUser();

    // Act
    const response = await request(app).get('/users/me');

    // Assert
    expect(response.status).toBe(401);
    const body = response.body as unknown as ApiBody<never>;
    expect(body.messageType).toBe('Unauthorized');
  });

  it('creates a workspace for an authenticated user', async () => {
    // Arrange
    const user = await createUser();

    // Act
    const response = await request(app)
      .post('/workspaces')
      .set(authorization(user.accessToken))
      .send({ name: 'Lab workspace' });

    // Assert
    expect(response.status).toBe(201);
    const body = response.body as unknown as ApiBody<WorkspaceResponse>;
    expect(body.data.name).toBe('Lab workspace');
    expect(body.data.role).toBe('Owner');
  });

  it('denies a workspace member permission to rename the workspace', async () => {
    // Arrange
    const owner = await createUser();
    const member = await createUser();
    const created = await request(app)
      .post('/workspaces')
      .set(authorization(owner.accessToken))
      .send({ name: 'Owner workspace' });
    const createdBody = created.body as unknown as ApiBody<WorkspaceResponse>;
    const memberRecord = await prisma.user.findUniqueOrThrow({ where: { email: member.email }, select: { id: true } });
    await prisma.workspaceMember.create({
      data: { workspaceId: createdBody.data.id, userId: memberRecord.id, role: 'Member' },
    });

    // Act
    const response = await request(app)
      .patch(`/workspaces/${createdBody.data.id}`)
      .set(authorization(member.accessToken))
      .send({ name: 'Unauthorized rename' });

    // Assert
    expect(response.status).toBe(403);
    const body = response.body as unknown as ApiBody<never>;
    expect(body.messageType).toBe('InsufficientWorkspaceRole');
  });
});
