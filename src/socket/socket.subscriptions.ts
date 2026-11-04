import type { ZodType } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/errors/app-error.js';
import {
  errorResponse,
  successResponse,
} from '../shared/utils/api-response.js';
import type { AppSocket } from './socket.types.js';

// ==================== ACKNOWLEDGEMENTS ====================

function respond(ack: unknown, response: unknown): void {
  if (typeof ack === 'function') {
    ack(response);
  }
}

// ==================== SUBSCRIPTIONS ====================

export async function handleSubscription<T>(
  socket: AppSocket,
  schema: ZodType<T>,
  payload: unknown,
  ack: unknown,
  apply: (subscription: T) => Promise<void>
): Promise<void> {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    respond(ack, errorResponse('ValidationFailed'));
    return;
  }

  try {
    await apply(parsed.data);
    respond(ack, successResponse(parsed.data));
  } catch (error) {
    if (error instanceof AppError) {
      respond(ack, errorResponse(error.code));
      return;
    }
    logger.error(
      { err: error, socketId: socket.id },
      'Socket subscription failed'
    );
    respond(ack, errorResponse('InternalError'));
  }
}

export async function joinVerified(
  socket: AppSocket,
  room: string,
  verifyAccess: () => Promise<unknown>
): Promise<void> {
  await verifyAccess();
  await socket.join(room);
  try {
    await verifyAccess();
  } catch (error) {
    await socket.leave(room);
    throw error;
  }
}
