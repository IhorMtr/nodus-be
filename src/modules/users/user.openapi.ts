import type { OpenAPIV3 } from 'openapi-types';

// ==================== HELPERS ====================

const schemaRef = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

const errorResponse = (
  description: string,
  codes: readonly string[]
): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    'application/json': {
      schema: schemaRef('ApiErrorResponse'),
      examples: Object.fromEntries(
        codes.map(code => [
          code,
          {
            value: {
              success: false,
              data: null,
              messageType: code,
              errors: null,
            },
          },
        ])
      ),
    },
  },
});

// ==================== SCHEMAS ====================

export const userSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  PresenceStatus: {
    type: 'string',
    enum: ['online', 'away', 'dnd', 'offline'],
  },
  UpdateStatusRequest: {
    type: 'object',
    required: ['status'],
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['online', 'away', 'dnd'] } },
  },
  PresenceUpdate: {
    type: 'object',
    required: ['userId', 'status'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', format: 'uuid' },
      status: schemaRef('PresenceStatus'),
    },
  },
  PresenceUpdateResponse: {
    type: 'object',
    required: ['success', 'data', 'messageType', 'errors'],
    additionalProperties: false,
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: schemaRef('PresenceUpdate'),
      messageType: { type: 'string', nullable: true, enum: [null] },
      errors: { type: 'object', nullable: true, enum: [null] },
    },
  },
  User: {
    type: 'object',
    required: ['id', 'firstName', 'lastName', 'email'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', maxLength: 100, example: 'John' },
      lastName: { type: 'string', maxLength: 100, example: 'Doe' },
      email: {
        type: 'string',
        format: 'email',
        maxLength: 254,
        example: 'john@example.com',
      },
    },
  },
  CurrentUserResponse: {
    type: 'object',
    required: ['success', 'data', 'messageType', 'errors'],
    additionalProperties: false,
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: schemaRef('User'),
      messageType: { type: 'string', nullable: true, enum: [null] },
      errors: { type: 'object', nullable: true, enum: [null] },
    },
  },
};

// ==================== OPERATIONS ====================

export const userPaths: OpenAPIV3.PathsObject = {
  '/users/me/status': {
    patch: {
      tags: ['Users'],
      operationId: 'updateCurrentUserStatus',
      summary: 'Set the current user status',
      description:
        'Sets the authenticated user’s saved status preference. Use online to clear away or dnd. The response contains the effective status: offline while no Socket.IO connection is active. A reconnect restores the saved preference. Offline cannot be selected manually.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: schemaRef('UpdateStatusRequest') },
        },
      },
      responses: {
        '200': {
          description: 'Effective status after the update.',
          content: {
            'application/json': { schema: schemaRef('PresenceUpdateResponse') },
          },
        },
        '400': errorResponse(
          'Invalid status, unknown field, or malformed JSON.',
          ['ValidationFailed', 'InvalidJson']
        ),
        '401': errorResponse('Missing, invalid, or expired access token.', [
          'Unauthorized',
          'AccessTokenExpired',
        ]),
        '404': errorResponse('The authenticated user no longer exists.', [
          'UserNotFound',
        ]),
        '500': errorResponse('Unexpected server error.', ['InternalError']),
      },
    },
  },
  '/users/me': {
    get: {
      tags: ['Users'],
      operationId: 'getCurrentUser',
      summary: 'Get the current user',
      description:
        'Returns the authenticated user from the database with only id, firstName, lastName, and email. Requires Authorization: Bearer <accessToken>. The user ID comes from the access token; the client does not supply it. Refresh tokens and cookies are not accepted.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Public details of the authenticated user.',
          content: {
            'application/json': { schema: schemaRef('CurrentUserResponse') },
          },
        },
        '401': errorResponse(
          'Missing, invalid, or expired Bearer access token. Refresh tokens cannot authorize this endpoint.',
          ['Unauthorized', 'AccessTokenExpired']
        ),
        '404': errorResponse(
          'The user identified by the access token no longer exists.',
          ['UserNotFound']
        ),
        '500': errorResponse('Unexpected server error.', ['InternalError']),
      },
    },
  },
};
