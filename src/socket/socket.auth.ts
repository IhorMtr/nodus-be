import type { ExtendedError } from 'socket.io';

import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { AppError } from '../shared/errors/app-error.js';
import type { AppSocket } from './socket.types.js';

// ==================== HANDSHAKE AUTHENTICATION ====================

export function authenticateSocket(
  socket: AppSocket,
  next: (error?: ExtendedError) => void
): void {
  const token: unknown = socket.handshake.auth.token;
  if (typeof token !== 'string' || token.length === 0) {
    next(new Error('Unauthorized'));
    return;
  }

  try {
    socket.data.userId = verifyAccessToken(token).userId.toLowerCase();
    next();
  } catch (error) {
    next(new Error(error instanceof AppError ? error.code : 'Unauthorized'));
  }
}
