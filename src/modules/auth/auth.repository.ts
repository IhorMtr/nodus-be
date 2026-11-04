import { prisma } from '../../database/client.js';
import { uniqueViolationTargets } from '../../database/errors.js';
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

async function revokeSessionByTokenHash(
  refreshTokenHash: string
): Promise<void> {
  await prisma.authSession.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ==================== PUBLIC API ====================

export function isUniqueEmailError(error: unknown): boolean {
  const targets = uniqueViolationTargets(error);
  return targets.includes('email') || targets.includes('User_email_key');
}

export const authRepository = {
  findUserByEmail,
  createUserWithSession,
  createSession,
  findSessionById,
  rotateSessionToken,
  revokeSessionByTokenHash,
};
