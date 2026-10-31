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
