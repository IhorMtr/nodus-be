import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { PrismaClient } from '../generated/prisma/client.js';

export const prisma = new PrismaClient({
  errorFormat: 'minimal',
  adapter: new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  }),
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

// Prisma error messages may include sensitive query arguments.
prisma.$on('warn', (event) => logger.warn({ target: event.target }, 'Prisma warning'));
prisma.$on('error', (event) => logger.error({ target: event.target }, 'Database query failed'));
