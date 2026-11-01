import type { OpenAPIV3 } from 'openapi-types';

// ==================== SCHEMAS ====================

const ref = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

export const searchSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  MessageSearchResult: {
    type: 'object',
    required: ['message', 'channel'],
    additionalProperties: false,
    properties: {
      message: ref('Message'),
      channel: {
        type: 'object',
        required: ['id', 'name'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
        },
      },
    },
  },
  MessageSearchPage: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: { type: 'array', items: ref('MessageSearchResult') },
      nextCursor: {
        type: 'string',
        nullable: true,
        description:
          'Opaque cursor for the next page of older results; null when exhausted.',
      },
    },
  },
  MessageSearchResponse: {
    type: 'object',
    required: ['success', 'data', 'messageType', 'errors'],
    additionalProperties: false,
    properties: {
      success: { type: 'boolean', enum: [true] },
      data: ref('MessageSearchPage'),
      messageType: { type: 'string', nullable: true, enum: [null] },
      errors: { type: 'object', nullable: true, enum: [null] },
    },
  },
};

// ==================== OPERATIONS ====================

const errorResponse = (description: string): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: ref('ApiErrorResponse') } },
});

export const searchPaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/search/messages': {
    get: {
      tags: ['Messages'],
      security: [{ bearerAuth: [] }],
      operationId: 'searchWorkspaceMessages',
      summary: 'Search messages in a workspace',
      description:
        'Owner, Admin, and Member may search all workspace channels or one channel. Case-insensitive literal substring matching on content. Results are newest first by createdAt descending, then id descending. Pass nextCursor as cursor for older results. The cursor is a timestamp and ID boundary and remains usable if its anchor message is deleted. Each result includes the public message, its channel ID and name for navigation. Deleted messages are absent. Unknown query fields are rejected.',
      parameters: [
        {
          name: 'workspaceId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'q',
          in: 'query',
          required: true,
          description: 'Trimmed search text, 3 to 200 characters.',
          schema: { type: 'string', minLength: 3, maxLength: 200 },
        },
        {
          name: 'channelId',
          in: 'query',
          required: false,
          description: 'Limit results to a channel in this workspace.',
          schema: { type: 'string', format: 'uuid' },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: 'Maximum results per page.',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: 'cursor',
          in: 'query',
          required: false,
          description:
            'Opaque nextCursor from the previous page. An invalid cursor returns 400 ValidationFailed.',
          schema: { type: 'string', minLength: 1, maxLength: 256 },
        },
      ],
      responses: {
        '200': {
          description:
            'Matching messages and pagination cursor. Empty results have items [] and nextCursor null.',
          content: {
            'application/json': { schema: ref('MessageSearchResponse') },
          },
        },
        '400': errorResponse(
          'ValidationFailed for invalid workspaceId, q, channelId, limit, cursor, or unknown query fields.'
        ),
        '401': errorResponse('Unauthorized or AccessTokenExpired.'),
        '404': errorResponse(
          'WorkspaceNotFound for a missing workspace or outsider; ChannelNotFound when channelId does not belong to this workspace.'
        ),
        '500': errorResponse('InternalError.'),
      },
    },
  },
};
