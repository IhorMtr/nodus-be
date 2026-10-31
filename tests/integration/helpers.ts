import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../../src/app.js';

export const testEmailPrefix = `vitest-${process.pid}-${randomUUID().slice(0, 8)}-`;
const testPassword = 'TestPassword123';
let userNumber = 0;

export interface TestUser {
  email: string;
  accessToken: string;
  password: string;
}

interface TokenResponse {
  data: { accessToken: string };
}

// ==================== TEST DATA ====================

export async function createUser(): Promise<TestUser> {
  userNumber += 1;
  const user = {
    firstName: 'Test',
    lastName: 'User',
    email: `${testEmailPrefix}${userNumber}@example.test`,
    password: testPassword,
  };

  const response = await request(app)
    .post('/auth/register')
    .send({
      ...user,
      confirmPassword: user.password,
    });

  if (response.status !== 201)
    throw new Error(`Test user registration failed: ${response.status}`);
  const body = response.body as TokenResponse;
  return {
    email: user.email,
    password: user.password,
    accessToken: body.data.accessToken,
  };
}

export async function loginUser(
  email: string,
  password: string
): Promise<string> {
  const response = await request(app)
    .post('/auth/login')
    .send({ email, password });
  if (response.status !== 200)
    throw new Error(`Test user login failed: ${response.status}`);
  const body = response.body as TokenResponse;
  return body.data.accessToken;
}

export function authorization(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
