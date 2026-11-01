import type { OpenAPIV3 } from 'openapi-types';

// ==================== SCHEMAS ====================

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const envelope = (
  data: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.SchemaObject => ({
  type: 'object',
  required: ['success', 'data', 'messageType', 'errors'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    data,
    messageType: { type: 'string', nullable: true, enum: [null] },
    errors: { type: 'object', nullable: true, enum: [null] },
  },
});
const uuid = { type: 'string', format: 'uuid' } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;

export const conversationSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  DirectMessage: {
    type: 'object',
    required: [
      'id',
      'conversationId',
      'author',
      'content',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: uuid,
      conversationId: uuid,
      author: {
        type: 'object',
        required: ['id', 'firstName', 'lastName'],
        properties: {
          id: uuid,
          firstName: { type: 'string' },
          lastName: { type: 'string' },
        },
      },
      content: { type: 'string' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  Conversation: {
    type: 'object',
    required: [
      'id',
      'workspaceId',
      'otherUser',
      'createdAt',
      'updatedAt',
      'lastMessage',
      'unreadCount',
      'hasUnread',
    ],
    properties: {
      id: uuid,
      workspaceId: uuid,
      otherUser: {
        type: 'object',
        required: ['id', 'firstName', 'lastName', 'status'],
        properties: {
          id: uuid,
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          status: {
            type: 'string',
            enum: ['online', 'away', 'dnd', 'offline'],
          },
        },
      },
      createdAt: dateTime,
      updatedAt: dateTime,
      lastMessage: { allOf: [ref('DirectMessage')], nullable: true },
      unreadCount: { type: 'integer', minimum: 0 },
      hasUnread: { type: 'boolean' },
    },
  },
  DirectHistory: {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: { type: 'array', items: ref('DirectMessage') },
      nextCursor: { type: 'string', nullable: true },
    },
  },
  ConversationReadState: {
    type: 'object',
    required: ['lastReadMessageId', 'lastReadAt'],
    properties: { lastReadMessageId: uuid, lastReadAt: dateTime },
  },
  ConversationResponse: envelope(ref('Conversation')),
  ConversationListResponse: envelope({
    type: 'array',
    items: ref('Conversation'),
  }),
  DirectMessageResponse: envelope(ref('DirectMessage')),
  DirectHistoryResponse: envelope(ref('DirectHistory')),
  ConversationReadStateResponse: envelope(ref('ConversationReadState')),
  EmptyConversationResponse: envelope({ type: 'object', nullable: true }),
};

// ==================== PATHS ====================

const security = [{ bearerAuth: [] }];
const workspaceId = {
  name: 'workspaceId',
  in: 'path' as const,
  required: true,
  schema: uuid,
};
const conversationId = {
  name: 'conversationId',
  in: 'path' as const,
  required: true,
  schema: uuid,
};
const messageId = {
  name: 'messageId',
  in: 'path' as const,
  required: true,
  schema: uuid,
};
const contentBody: OpenAPIV3.RequestBodyObject = {
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 4000 },
        },
      },
    },
  },
};
const response = (
  name: string,
  description: string
): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});
const errors = {
  '400': response('ApiErrorResponse', 'Invalid request'),
  '401': response('ApiErrorResponse', 'Unauthorized'),
  '403': response('ApiErrorResponse', 'Forbidden'),
  '404': response(
    'ApiErrorResponse',
    'Workspace, conversation, member, or message not found'
  ),
};
const messagePath =
  '/workspaces/{workspaceId}/conversations/{conversationId}/messages';

export const conversationPaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/conversations': {
    parameters: [workspaceId],
    post: {
      tags: ['Conversations'],
      security,
      operationId: 'createConversation',
      summary: 'Find or create a one-to-one conversation',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['userId'],
              properties: { userId: uuid },
            },
          },
        },
      },
      responses: {
        '200': response('ConversationResponse', 'Existing conversation'),
        '201': response('ConversationResponse', 'Conversation created'),
        ...errors,
      },
    },
    get: {
      tags: ['Conversations'],
      security,
      operationId: 'listConversations',
      summary:
        'List conversations with participant, presence, latest message, and unread state',
      responses: {
        '200': response('ConversationListResponse', 'Conversations'),
        ...errors,
      },
    },
  },
  [messagePath]: {
    parameters: [workspaceId, conversationId],
    get: {
      tags: ['Conversations'],
      security,
      operationId: 'listDirectMessages',
      summary: 'Read direct message history',
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100 },
        },
        {
          name: 'before',
          in: 'query',
          schema: { type: 'string' },
          description: 'Opaque (createdAt, id) cursor',
        },
      ],
      responses: {
        '200': response('DirectHistoryResponse', 'Message history'),
        ...errors,
      },
    },
    post: {
      tags: ['Conversations'],
      security,
      operationId: 'sendDirectMessage',
      summary: 'Send a direct message and notify the recipient',
      requestBody: contentBody,
      responses: {
        '201': response('DirectMessageResponse', 'Message created'),
        ...errors,
      },
    },
  },
  [`${messagePath}/{messageId}`]: {
    parameters: [workspaceId, conversationId, messageId],
    patch: {
      tags: ['Conversations'],
      security,
      operationId: 'updateDirectMessage',
      summary: 'Edit your direct message',
      requestBody: contentBody,
      responses: {
        '200': response('DirectMessageResponse', 'Message updated'),
        ...errors,
      },
    },
    delete: {
      tags: ['Conversations'],
      security,
      operationId: 'deleteDirectMessage',
      summary: 'Delete your direct message',
      responses: {
        '200': response('EmptyConversationResponse', 'Message deleted'),
        ...errors,
      },
    },
  },
  '/workspaces/{workspaceId}/conversations/{conversationId}/read-state': {
    parameters: [workspaceId, conversationId],
    put: {
      tags: ['Conversations'],
      security,
      operationId: 'markConversationRead',
      summary: 'Advance read position to an existing message',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['lastReadMessageId'],
              properties: { lastReadMessageId: uuid },
            },
          },
        },
      },
      responses: {
        '200': response('ConversationReadStateResponse', 'Read position'),
        ...errors,
      },
    },
  },
};
