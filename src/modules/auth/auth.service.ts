import { randomUUID } from 'node:crypto';
import { hash, verify } from 'argon2';

import { AppError } from '../../shared/errors/app-error.js';
import { ARGON2_OPTIONS } from './auth.constants.js';
import { authRepository, isUniqueEmailError } from './auth.repository.js';
import { fingerprintRefreshToken, issueTokenPair, verifyRefreshToken } from './auth.tokens.js';
import type { AuthTokens, LoginInput, RegisterInput } from './auth.types.js';

// ==================== CONSTANTS ====================

// A random, unused password with the same Argon2id cost as registered passwords.
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=19456,p=1,t=2$rkuphX00OTgLnhxhEKe35A$zrjqHEid7srprw5kD8Me8XdeuajBJ6j7ao7IXX3REzU';

// ==================== AUTHENTICATION ====================

async function register(input: RegisterInput): Promise<AuthTokens> {
  if (await authRepository.findUserByEmail(input.email)) {
    throw new AppError('An account with this email already exists', 409, 'EmailAlreadyExists');
  }

  const passwordHash = await hash(input.password, ARGON2_OPTIONS);
  const userId = randomUUID();
  const sessionId = randomUUID();
  const pair = issueTokenPair(userId, sessionId);

  try {
    await authRepository.createUserWithSession({
      id: userId,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      passwordHash,
    }, {
      id: sessionId,
      refreshTokenHash: pair.refreshTokenHash,
      expiresAt: pair.refreshExpiresAt,
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new AppError('An account with this email already exists', 409, 'EmailAlreadyExists');
    }
    throw error;
  }

  return pair.tokens;
}

async function login(input: LoginInput): Promise<AuthTokens> {
  const user = await authRepository.findUserByEmail(input.email);
  const passwordMatches = await verify(user?.passwordHash ?? DUMMY_PASSWORD_HASH, input.password);

  if (!user || !passwordMatches) {
    throw new AppError('Email or password is incorrect', 401, 'InvalidCredentials');
  }

  const sessionId = randomUUID();
  const pair = issueTokenPair(user.id, sessionId);
  await authRepository.createSession(user.id, {
    id: sessionId,
    refreshTokenHash: pair.refreshTokenHash,
    expiresAt: pair.refreshExpiresAt,
  });

  return pair.tokens;
}

// ==================== SESSION LIFECYCLE ====================

async function refresh(refreshToken: string): Promise<AuthTokens> {
  const claims = verifyRefreshToken(refreshToken);
  const session = await authRepository.findSessionById(claims.sessionId);

  if (!session || session.userId !== claims.userId) {
    throw new AppError('Refresh token is invalid', 401, 'InvalidRefreshToken');
  }
  if (session.revokedAt !== null) {
    throw new AppError('Session has been revoked', 401, 'SessionRevoked');
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    throw new AppError('Refresh token has expired', 401, 'RefreshTokenExpired');
  }

  const previousTokenHash = fingerprintRefreshToken(refreshToken);
  if (session.refreshTokenHash !== previousTokenHash) {
    throw new AppError('Refresh token has already been used', 401, 'RefreshTokenReused');
  }

  const pair = issueTokenPair(claims.userId, session.id);
  const rotated = await authRepository.rotateSessionToken({
    id: session.id,
    userId: claims.userId,
    previousTokenHash,
    refreshTokenHash: pair.refreshTokenHash,
    expiresAt: pair.refreshExpiresAt,
    now,
  });

  if (!rotated) {
    throw new AppError('Refresh token has already been used', 401, 'RefreshTokenReused');
  }

  return pair.tokens;
}

async function logout(refreshToken: string): Promise<void> {
  // The persisted fingerprint authenticates logout even after JWT expiration.
  await authRepository.revokeSessionByTokenHash(fingerprintRefreshToken(refreshToken));
}

// ==================== PUBLIC API ====================

export const authService = { register, login, refresh, logout };
