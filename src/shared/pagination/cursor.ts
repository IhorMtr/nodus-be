import { z } from 'zod';
import { uuidSchema } from '../validation/schemas.js';

// ==================== TYPES ====================

export type Cursor = { createdAt: Date; id: string };

// ==================== VALIDATION ====================

const cursorPayloadSchema = z.strictObject({
  createdAt: z.iso.datetime({ precision: 3 }),
  id: uuidSchema,
});

function decodeCursor(value: string): Cursor {
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Invalid encoding');
  }
  const payload = cursorPayloadSchema.parse(
    JSON.parse(decoded.toString('utf8'))
  );
  const createdAt = new Date(payload.createdAt);
  if (createdAt.toISOString() !== payload.createdAt) {
    throw new Error('Invalid timestamp');
  }
  return { createdAt, id: payload.id };
}

export const cursorSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid pagination cursor')
  .transform((value, context) => {
    try {
      return decodeCursor(value);
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Invalid pagination cursor',
      });
      return z.NEVER;
    }
  });

// ==================== ENCODING ====================

export function encodeCursor(row: Cursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })
  ).toString('base64url');
}

export function cursorOf(row: Cursor | undefined): string | null {
  return row ? encodeCursor(row) : null;
}

// ==================== KEYSET FILTERS ====================

export function olderThan(cursor: Cursor) {
  return {
    createdAt: { lte: cursor.createdAt },
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

export function newerThan(cursor: Cursor) {
  return {
    createdAt: { gte: cursor.createdAt },
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}
