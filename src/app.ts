import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { httpLogger } from './config/logger.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import { router } from './routes/index.js';

// ==================== APPLICATION ====================

export const app = express();

app.disable('x-powered-by');

// ==================== HTTP MIDDLEWARE ====================

app.use(httpLogger);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
    },
  },
}));
app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json({ limit: '1mb' }));

// ==================== ROUTING AND ERRORS ====================

app.use(router);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
