import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { pino } from 'pino';
import { pinoHttp, stdSerializers } from 'pino-http';
import { env } from './env.js';

// ==================== SENSITIVE DATA ====================

const sensitiveFields = [
  'password', 'confirmPassword', 'passwordHash', 'accessToken', 'refreshToken',
  'refreshTokenHash', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'authorization',
];

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { type: 'UnknownError' };
  // Database errors can embed query arguments in their messages and causes.
  const header = `${error.name}: ${error.message}`;
  const frames = error.stack?.startsWith(header) ? error.stack.slice(header.length) : undefined;
  return {
    type: error.name,
    code: 'code' in error && typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
      ? error.code : undefined,
    stack: frames?.split('\n').filter((line) => /^\s+at /.test(line)).join('\n'),
  };
}

// ==================== LOGGER ====================

export const logger = pino({
  level: env.LOG_LEVEL,
  serializers: { err: serializeError },
  redact: {
    paths: [
      ...sensitiveFields.flatMap((field) => [field, `*.${field}`, `*.*.${field}`]),
      'req.body',
      'res.body',
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development' ? {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  } : {}),
});

// ==================== HTTP LOGGING ====================

export const httpLogger = pinoHttp({
  logger,
  wrapSerializers: false,
  serializers: {
    req: (request: IncomingMessage) => {
      const serialized = stdSerializers.req(request);
      return {
        id: serialized.id,
        method: serialized.method,
        url: serialized.url.split('?')[0],
        remoteAddress: serialized.remoteAddress,
      };
    },
    res: stdSerializers.res,
    err: serializeError,
  },
  genReqId: (_request, response) => {
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    return requestId;
  },
});
