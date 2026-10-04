import type { ConnectionOptions } from 'bullmq';

import { redis } from '../redis/client.js';

// Producers share this client. Workers need a dedicated maxRetriesPerRequest: null
// connection; close workers and queues before closing their Redis connections.
export const queueConnection = redis satisfies ConnectionOptions;
