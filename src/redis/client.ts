import { Redis } from 'ioredis';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// ==================== CLIENT ====================

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 10_000,
});

// ==================== EVENTS ====================

redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis connection error');
});

// ==================== LIFECYCLE ====================

export async function closeRedis(): Promise<void> {
  if (redis.status !== 'ready') {
    redis.disconnect();
    return;
  }

  try {
    await redis.quit();
  } catch (error) {
    redis.disconnect();
    throw error;
  }
}
