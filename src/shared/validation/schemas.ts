import { z } from 'zod';

export const uuidSchema = z.uuid().transform(value => value.toLowerCase());

export const pageLimitSchema = z
  .string()
  .regex(/^[0-9]+$/, 'Limit must be an integer')
  .transform(Number)
  .pipe(z.number().int().min(1).max(100))
  .default(50);
