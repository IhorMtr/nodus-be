import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';

// ==================== ERROR CODES ====================

const prismaErrorCodes = {
  uniqueViolation: 'P2002',
  foreignKeyViolation: 'P2003',
  recordNotFound: 'P2025',
  transactionConflict: 'P2034',
} as const;

export function isPrismaError(
  error: unknown,
  kind: keyof typeof prismaErrorCodes
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === prismaErrorCodes[kind]
  );
}

// ==================== UNIQUE CONSTRAINTS ====================

const adapterUniqueViolationSchema = z.object({
  cause: z.object({
    kind: z.literal('UniqueConstraintViolation'),
    constraint: z.object({
      index: z.string().optional(),
      fields: z.array(z.string()).optional(),
    }),
  }),
});

export function uniqueViolationTargets(error: unknown): string[] {
  if (!isPrismaError(error, 'uniqueViolation')) {
    return [];
  }

  const targets: string[] = [];
  const target: unknown = error.meta?.['target'];
  if (typeof target === 'string') {
    targets.push(target);
  } else if (Array.isArray(target)) {
    targets.push(...target.filter(item => typeof item === 'string'));
  }

  const adapterError = adapterUniqueViolationSchema.safeParse(
    error.meta?.['driverAdapterError']
  );
  if (adapterError.success) {
    const { index, fields = [] } = adapterError.data.cause.constraint;
    if (index) {
      targets.push(index);
    }
    targets.push(...fields);
  }
  return targets;
}
