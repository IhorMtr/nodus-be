import type { OpenAPIV3 } from 'openapi-types';

// ==================== HELPERS ====================

const schemaRef = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});

const requestBody = (name: string): OpenAPIV3.RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema: schemaRef(name) } },
});

const successResponse = (
  description: string,
  schemaName: string,
): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: schemaRef(schemaName) } },
});

const errorResponse = (
  description: string,
  codes: readonly string[],
): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    'application/json': {
      schema: schemaRef('ApiErrorResponse'),
      examples: Object.fromEntries(codes.map((code) => [code, {
        value: { success: false, data: null, messageType: code, errors: null },
      }])),
    },
  },
});

const validationResponse = (
  fields: Record<string, string[]>,
  hasBody = false,
): OpenAPIV3.ResponseObject => ({
  description: 'Invalid UUID path parameters, request body, pagination limit, or cursor. Validation errors are grouped by field; request-level errors, including unknown body or query fields, use _form. Empty bodies and whitespace-only content are rejected.',
  content: {
    'application/json': {
      schema: schemaRef('ApiErrorResponse'),
      examples: {
        ValidationFailed: {
          value: { success: false, data: null, messageType: 'ValidationFailed', errors: fields },
        },
        ...(hasBody ? {
          InvalidJson: {
            value: { success: false, data: null, messageType: 'InvalidJson', errors: null },
          },
        } : {}),
      },
    },
  },
});

const successEnvelope = (
  data: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
): OpenAPIV3.SchemaObject => ({
  type: 'object',
  required: ['success', 'data', 'messageType', 'errors'],
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', enum: [true] },
    data,
    messageType: { type: 'string', nullable: true, enum: [null] },
    errors: { type: 'object', nullable: true, enum: [null] },
  },
});

// ==================== SCHEMAS ====================

const content: OpenAPIV3.SchemaObject = {
  type: 'string',
  minLength: 1,
  maxLength: 4000,
  description: 'Plain text. Leading and trailing whitespace is trimmed before length validation. A whitespace-only message is invalid.',
  example: 'Hello everyone',
};

export const messageSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  MessageAuthor: {
    type: 'object',
    required: ['id', 'firstName', 'lastName'],
    additionalProperties: false,
    description: 'Public author information. Email, password hashes, sessions, and tokens are never included.',
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', example: 'John' },
      lastName: { type: 'string', example: 'Doe' },
    },
  },
  Message: {
    type: 'object',
    required: ['id', 'channelId', 'author', 'content', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      channelId: { type: 'string', format: 'uuid' },
      author: schemaRef('MessageAuthor'),
      content,
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: {
        type: 'string',
        format: 'date-time',
        description: 'Timestamp of the most recent update. There is no separate edited flag or version history.',
      },
    },
  },
  CreateMessageRequest: {
    type: 'object',
    required: ['content'],
    additionalProperties: false,
    properties: { content },
    description: 'The authenticated user is always the author. Client-supplied authorId, userId, and other unknown fields are rejected.',
  },
  UpdateMessageRequest: {
    type: 'object',
    required: ['content'],
    additionalProperties: false,
    properties: { content: { ...content, example: 'Updated text' } },
  },
  MessageHistory: {
    type: 'object',
    required: ['items', 'nextCursor'],
    additionalProperties: false,
    properties: {
      items: {
        type: 'array',
        items: schemaRef('Message'),
        description: 'Messages from the requested channel only, ordered oldest to newest within this page by createdAt ascending, then id ascending.',
      },
      nextCursor: {
        type: 'string',
        nullable: true,
        description: 'Opaque cursor for the next page of older messages. Pass it unchanged as before. It identifies the oldest message boundary on this page and is null when no older messages remain.',
      },
    },
  },
  MessageResponse: successEnvelope(schemaRef('Message')),
  MessageHistoryResponse: successEnvelope(schemaRef('MessageHistory')),
  MessageDeleteResponse: successEnvelope({ type: 'object', nullable: true, enum: [null] }),
};

// ==================== OPERATIONS ====================

const protectedOperation = {
  tags: ['Messages'],
  security: [{ bearerAuth: [] }],
};

const authenticatedResponses: OpenAPIV3.ResponsesObject = {
  '401': errorResponse('Missing, invalid, or expired Bearer access token. Refresh tokens and cookies cannot authorize this endpoint.', [
    'Unauthorized', 'AccessTokenExpired',
  ]),
  '500': errorResponse('Unexpected server error.', ['InternalError']),
};

const channelNotFound = errorResponse(
  'The workspace does not exist or the authenticated user is not a member (WorkspaceNotFound), or the channel does not exist within the workspace specified in the URL (ChannelNotFound). Workspace membership is checked before channel lookup.',
  ['WorkspaceNotFound', 'ChannelNotFound'],
);

const messageNotFound = errorResponse(
  'Workspace and channel access are checked first. An unavailable workspace returns WorkspaceNotFound; a missing channel or a channel from another workspace returns ChannelNotFound. A missing message or a message from another channel returns MessageNotFound without revealing its actual location.',
  ['WorkspaceNotFound', 'ChannelNotFound', 'MessageNotFound'],
);

const workspaceIdParameter: OpenAPIV3.ParameterObject = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  description: 'UUID of a workspace where the authenticated user is an Owner, Admin, or Member.',
  schema: { type: 'string', format: 'uuid' },
};

const channelIdParameter: OpenAPIV3.ParameterObject = {
  name: 'channelId',
  in: 'path',
  required: true,
  description: 'UUID of a channel belonging to the workspace specified in the URL.',
  schema: { type: 'string', format: 'uuid' },
};

const messageIdParameter: OpenAPIV3.ParameterObject = {
  name: 'messageId',
  in: 'path',
  required: true,
  description: 'UUID of a message belonging to the channel specified in the URL.',
  schema: { type: 'string', format: 'uuid' },
};

const invalidChannelParams = { workspaceId: ['Invalid UUID'], channelId: ['Invalid UUID'] };
const invalidMessageParams = { ...invalidChannelParams, messageId: ['Invalid UUID'] };

export const messagePaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/channels/{channelId}/messages': {
    parameters: [workspaceIdParameter, channelIdParameter],
    post: {
      ...protectedOperation,
      operationId: 'createMessage',
      summary: 'Send a channel message',
      description: 'Available to Owner, Admin, and Member. The authenticated user becomes the author. The channel must belong to the workspace specified in the URL. Content is required; empty bodies and unknown fields are rejected.',
      requestBody: requestBody('CreateMessageRequest'),
      responses: {
        ...authenticatedResponses,
        '201': successResponse('Message created.', 'MessageResponse'),
        '400': validationResponse({ ...invalidChannelParams, content: ['Content is required'] }, true),
        '404': channelNotFound,
      },
    },
    get: {
      ...protectedOperation,
      operationId: 'listMessages',
      summary: 'Get channel message history',
      description: 'Available to Owner, Admin, and Member. Message history uses cursor-based pagination. Without before, returns the newest limit messages. Pass nextCursor as before to request older messages. Selection uses createdAt descending, then id descending, so messages with identical timestamps remain stable; each response page is returned oldest to newest. The cursor stores the time and ID boundary, so deleting its anchor message does not invalidate pagination. nextCursor is null when there are no older messages. Only messages from the requested channel are included. Unknown query fields are rejected.',
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: 'Maximum messages to return on this page.',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
        },
        {
          name: 'before',
          in: 'query',
          required: false,
          description: 'Opaque cursor returned as nextCursor by the previous page. Pass it unchanged; clients must not depend on its internal structure. Returns messages older than the cursor boundary. An invalid cursor returns 400 ValidationFailed.',
          schema: { type: 'string', minLength: 1, maxLength: 256 },
        },
      ],
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Channel message history and the cursor for older messages. Empty history has items [] and nextCursor null.', 'MessageHistoryResponse'),
        '400': validationResponse({ ...invalidChannelParams, limit: ['Limit must be an integer between 1 and 100'], before: ['Invalid cursor'] }),
        '404': channelNotFound,
      },
    },
  },
  '/workspaces/{workspaceId}/channels/{channelId}/messages/{messageId}': {
    parameters: [workspaceIdParameter, channelIdParameter, messageIdParameter],
    patch: {
      ...protectedOperation,
      operationId: 'updateMessage',
      summary: 'Edit an authored message',
      description: 'Only the message author can edit the content, while still a member of this workspace. Owner and Admin cannot edit another user\'s message. Content is required and uses the same validation as creation; empty bodies and unknown fields are rejected. Returns the updated public message.',
      requestBody: requestBody('UpdateMessageRequest'),
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Message updated.', 'MessageResponse'),
        '400': validationResponse({ ...invalidMessageParams, content: ['Content is required'] }, true),
        '403': errorResponse('The authenticated user is not the message author. Owner and Admin have no exception to this rule.', ['MessageEditForbidden']),
        '404': messageNotFound,
      },
    },
    delete: {
      ...protectedOperation,
      operationId: 'deleteMessage',
      summary: 'Delete a channel message',
      description: 'The author can delete their own message regardless of workspace role, while still a workspace member. Owner and Admin can delete any message in this workspace, including messages authored by the Owner or other Admins. Member can delete only their own messages. Permanently deletes the message; no soft delete or tombstone is retained. Successful deletion returns the unified response envelope with data set to null.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Message permanently deleted.', 'MessageDeleteResponse'),
        '400': validationResponse(invalidMessageParams),
        '403': errorResponse('A workspace Member cannot delete another user\'s message.', ['MessageDeleteForbidden']),
        '404': messageNotFound,
      },
    },
  },
};
