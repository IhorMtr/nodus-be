import type { ConnectionOptions } from 'bullmq';

import { redis } from '../redis/client.js';

export const queueConnection = redis satisfies ConnectionOptions;
