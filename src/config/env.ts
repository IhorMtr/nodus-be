import 'dotenv/config';
import { z } from 'zod';

// ==================== SCHEMA ====================

function connectionUrl(protocols: readonly string[]) {
  return z.url().pipe(z.string().refine((value) => {
    const url = new URL(value);
    return protocols.includes(url.protocol) && url.hostname.length > 0;
  }, {
    message: `Expected a hostname and protocol: ${protocols.join(' or ')}`,
  }));
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: connectionUrl(['postgres:', 'postgresql:']),
  REDIS_URL: connectionUrl(['redis:', 'rediss:']),
  JWT_ACCESS_SECRET: z.string().trim().min(32),
  JWT_REFRESH_SECRET: z.string().trim().min(32),
  CORS_ORIGINS: z.string().default('http://localhost:5173')
    .transform((value) => value.split(',').map((origin) => origin.trim()))
    .pipe(z.array(z.url().pipe(z.string().refine((value) => {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && value === url.origin;
    }, { message: 'Expected an HTTP(S) origin without a path or trailing slash' }))).min(1)),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
}).refine((value) => value.JWT_ACCESS_SECRET !== value.JWT_REFRESH_SECRET, {
  path: ['JWT_REFRESH_SECRET'],
  message: 'Access and refresh secrets must be different',
});

// ==================== VALIDATED CONFIGURATION ====================

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = result.data;
