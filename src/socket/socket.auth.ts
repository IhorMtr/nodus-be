import type { ExtendedError } from 'socket.io';

import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { AppError } from '../shared/errors/app-error.js';
import type { AppSocket } from './socket.types.js';

// Clients send the access token in the handshake `auth` payload, never in the URL.
export function authenticateSocket(socket: AppSocket, next: (error?: ExtendedError) => void): void {
  const token: unknown = socket.handshake.auth.token;
  if (typeof token !== 'string' || token.length === 0) {
    next(new Error('Unauthorized'));
    return;
  }

  try {
    // Room names are case sensitive and REST params are normalized to lowercase.
    socket.data.userId = verifyAccessToken(token).userId.toLowerCase();
    next();
  } catch (error) {
    // Only the public application code reaches the client, never verifier internals.
    next(new Error(error instanceof AppError ? error.code : 'Unauthorized'));
  }
}
