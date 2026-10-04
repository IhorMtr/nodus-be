import { createHash, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants.js';
import type { AuthContext, AuthTokens } from './auth.types.js';

// ==================== CLAIMS ====================

const baseClaimsSchema = z.object({
  sub: z.uuid(),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().positive(),
  jti: z.uuid(),
});

const accessClaimsSchema = baseClaimsSchema.extend({
  type: z.literal('access'),
});

const refreshClaimsSchema = baseClaimsSchema.extend({
  type: z.literal('refresh'),
  sid: z.uuid(),
});

// ==================== PUBLIC API ====================

export function fingerprintRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueTokenPair(userId: string, sessionId: string): {
  tokens: AuthTokens;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
} {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const accessExpiresAt = issuedAt + ACCESS_TOKEN_TTL_SECONDS;
  const refreshExpiresAt = issuedAt + REFRESH_TOKEN_TTL_SECONDS;

  const accessToken = jwt.sign({
    sub: userId,
    iat: issuedAt,
    exp: accessExpiresAt,
    jti: randomUUID(),
    type: 'access',
  }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });

  const refreshToken = jwt.sign({
    sub: userId,
    iat: issuedAt,
    exp: refreshExpiresAt,
    jti: randomUUID(),
    type: 'refresh',
    sid: sessionId,
  }, env.JWT_REFRESH_SECRET, { algorithm: 'HS256' });

  return {
    tokens: {
      accessToken,
      refreshToken,
      expiresAt: new Date(accessExpiresAt * 1_000).toISOString(),
    },
    refreshTokenHash: fingerprintRefreshToken(refreshToken),
    refreshExpiresAt: new Date(refreshExpiresAt * 1_000),
  };
}

export function verifyAccessToken(token: string): AuthContext {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    const claims = accessClaimsSchema.parse(payload);
    return { userId: claims.sub };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token has expired', 401, 'AccessTokenExpired');
    }
    throw new AppError('A valid access token is required', 401, 'Unauthorized');
  }
}

export function verifyRefreshToken(token: string): AuthContext & { sessionId: string } {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] });
    const claims = refreshClaimsSchema.parse(payload);
    return { userId: claims.sub, sessionId: claims.sid };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Refresh token has expired', 401, 'RefreshTokenExpired');
    }
    throw new AppError('Refresh token is invalid', 401, 'InvalidRefreshToken');
  }
}
