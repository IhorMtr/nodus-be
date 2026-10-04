import { z } from 'zod';

import { prisma } from '../../database/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { RegisterInput } from './auth.types.js';

// ==================== TYPES ====================

type NewSession = {
  id: string;
  refreshTokenHash: string;
  expiresAt: Date;
};

type NewUser = Pick<RegisterInput, 'firstName' | 'lastName' | 'email'> & {
  id: string;
  passwordHash: string;
};

type SessionRotation = {
  id: string;
  userId: string;
  previousTokenHash: string;
  refreshTokenHash: string;
  expiresAt: Date;
  now: Date;
};

// ==================== DATABASE ACCESS ====================

function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
}

function createUserWithSession(user: NewUser, session: NewSession) {
  // A nested write commits the user and its initial session together.
  return prisma.user.create({
    data: {
      ...user,
      authSessions: { create: session },
    },
    select: { id: true },
  });
}

function createSession(userId: string, session: NewSession) {
  return prisma.authSession.create({
    data: { userId, ...session },
    select: { id: true },
  });
}

function findSessionById(id: string) {
  return prisma.authSession.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      refreshTokenHash: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
}

async function rotateSessionToken(rotation: SessionRotation): Promise<boolean> {
  // PostgreSQL rechecks this condition after acquiring the row lock.
  const result = await prisma.authSession.updateMany({
    where: {
      id: rotation.id,
      userId: rotation.userId,
      refreshTokenHash: rotation.previousTokenHash,
      revokedAt: null,
      expiresAt: { gt: rotation.now },
    },
    data: {
      refreshTokenHash: rotation.refreshTokenHash,
      expiresAt: rotation.expiresAt,
    },
  });
  return result.count === 1;
}

async function revokeSessionByTokenHash(refreshTokenHash: string): Promise<void> {
  await prisma.authSession.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ==================== PUBLIC API ====================

export function isUniqueEmailError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target: unknown = error.meta?.['target'];
  if (Array.isArray(target) && target.includes('email')) {
    return true;
  }

  // Prisma's PostgreSQL driver adapter reports the database constraint name.
  const adapterError = z.object({
    cause: z.object({
      kind: z.literal('UniqueConstraintViolation'),
      constraint: z.object({
        index: z.string().optional(),
        fields: z.array(z.string()).optional(),
      }),
    }),
  }).safeParse(error.meta?.['driverAdapterError']);

  return adapterError.success && (
    adapterError.data.cause.constraint.index === 'User_email_key' ||
    adapterError.data.cause.constraint.fields?.includes('email') === true
  );
}

export const authRepository = {
  findUserByEmail,
  createUserWithSession,
  createSession,
  findSessionById,
  rotateSessionToken,
  revokeSessionByTokenHash,
};
