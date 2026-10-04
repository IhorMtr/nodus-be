import type { OpenAPIV3 } from 'openapi-types';

import { authPaths, authSchemas } from '../modules/auth/auth.openapi.js';
import { workspacePaths, workspaceSchemas } from '../modules/workspaces/workspace.openapi.js';

export const openApiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'Nodus API',
    version: '0.1.0',
    description: 'HTTP API for Nodus.',
  },
  tags: [
    { name: 'Auth', description: 'User authentication.' },
    { name: 'Workspaces', description: 'Workspaces, memberships, and basic role authorization.' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Access token sent as Authorization: Bearer <accessToken>. Refresh tokens and cookies are not accepted.',
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
            description: 'Machine-readable application error code.',
          },
          errors: {
            type: 'object',
            nullable: true,
            additionalProperties: { type: 'array', items: { type: 'string' } },
            description: 'Field validation messages, or null when there are no field errors. Request-level messages use _form.',
          },
        },
      },
      ...authSchemas,
      ...workspaceSchemas,
    },
  },
  paths: {
    '/health': {
      get: {
        operationId: 'getHealth',
        summary: 'Check API availability',
        responses: {
          '200': {
            description: 'The API is available.',
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
    ...workspacePaths,
  },
};

