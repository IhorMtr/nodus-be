import type { OpenAPIV3 } from 'openapi-types';

import { authPaths, authSchemas } from '../modules/auth/auth.openapi.js';

export const openApiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Nodus API',
    version: '0.1.0',
    description: 'HTTP API for Nodus. Authentication never uses cookies. Registration and login return tokens in JSON. Refresh and logout accept a refresh token only in the JSON body. Protected routes accept an access token only through Authorization: Bearer <accessToken>.',
  },
  tags: [{ name: 'Auth', description: 'Email/password authentication and session lifecycle.' }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access JWT only. Missing, malformed, incorrectly signed, or wrong-type tokens return HTTP 401 Unauthorized; expired access tokens return HTTP 401 AccessTokenExpired. Refresh tokens, cookies, query parameters, and request bodies cannot authenticate protected routes.',
      },
    },
    schemas: {
      ApiErrorResponse: {
        type: 'object',
        required: ['success', 'data', 'messageType', 'errors'],
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', enum: [false] },
          data: { type: 'object', nullable: true, enum: [null] },
          messageType: {
            type: 'string',
            description: 'Machine-readable PascalCase application error code.',
          },
          errors: {
            type: 'object',
            nullable: true,
            additionalProperties: { type: 'array', items: { type: 'string' } },
            description: 'Field validation messages, or null for other errors. Request-level validation messages use _form.',
          },
        },
      },
      ...authSchemas,
    },
  },
  paths: {
    '/health': {
      get: {
        operationId: 'getHealth',
        summary: 'Check whether the HTTP server is running',
        responses: {
          '200': {
            description: 'The server is running.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['success', 'data', 'messageType', 'errors'],
                  properties: {
                    success: { type: 'boolean', enum: [true] },
                    data: {
                      type: 'object',
                      required: ['status'],
                      properties: { status: { type: 'string', enum: ['ok'] } },
                      additionalProperties: false,
                    },
                    messageType: { type: 'string', nullable: true, enum: [null] },
                    errors: { type: 'object', nullable: true, enum: [null] },
                  },
                  additionalProperties: false,
                },
                example: { success: true, data: { status: 'ok' }, messageType: null, errors: null },
              },
            },
          },
        },
      },
    },
    ...authPaths,
  },
};
