import type { OpenAPIV3 } from 'openapi-types';

// ==================== SCHEMAS ====================

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const response = (name: string): OpenAPIV3.ResponseObject => ({
  description: 'Success',
  content: { 'application/json': { schema: ref(name) } },
});
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

export const notificationSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  Notification: {
    type: 'object',
    required: [
      'id',
      'userId',
      'workspaceId',
      'type',
      'entityId',
      'title',
      'message',
      'readAt',
      'createdAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      workspaceId: { type: 'string', format: 'uuid' },
      type: {
        type: 'string',
        enum: [
          'AnnouncementPublished',
          'WorkspaceRoleChanged',
          'WorkspaceRemoved',
        ],
      },
      entityId: { type: 'string', format: 'uuid', nullable: true },
      title: { type: 'string' },
      message: { type: 'string' },
      readAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  NotificationPage: {
    type: 'object',
    required: ['items', 'page', 'limit', 'total'],
    properties: {
      items: { type: 'array', items: ref('Notification') },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
    },
  },
  NotificationPageResponse: envelope(ref('NotificationPage')),
  NotificationResponse: envelope(ref('Notification')),
  NotificationCountResponse: envelope({
    type: 'object',
    required: ['count'],
    properties: { count: { type: 'integer' } },
  }),
  NotificationReadAllResponse: envelope({
    type: 'object',
    required: ['updatedCount'],
    properties: { updatedCount: { type: 'integer' } },
  }),
};

// ==================== PATHS ====================

const security = [{ bearerAuth: [] }];
const errors = {
  '400': {
    description: 'Invalid pagination or UUID',
    content: { 'application/json': { schema: ref('ApiErrorResponse') } },
  },
  '401': {
    description: 'Unauthorized',
    content: { 'application/json': { schema: ref('ApiErrorResponse') } },
  },
};

export const notificationPaths: OpenAPIV3.PathsObject = {
  '/notifications': {
    get: {
      tags: ['Notifications'],
      security,
      summary: 'List current user notifications',
      parameters: [
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      ],
      responses: { '200': response('NotificationPageResponse'), ...errors },
    },
  },
  '/notifications/unread-count': {
    get: {
      tags: ['Notifications'],
      security,
      summary: 'Count unread notifications',
      responses: {
        '200': response('NotificationCountResponse'),
        '401': errors['401'],
      },
    },
  },
  '/notifications/{notificationId}/read': {
    patch: {
      tags: ['Notifications'],
      security,
      summary: 'Mark one notification as read',
      parameters: [
        {
          in: 'path',
          name: 'notificationId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': response('NotificationResponse'),
        ...errors,
        '404': {
          description: 'Notification not found or belongs to another user',
          content: { 'application/json': { schema: ref('ApiErrorResponse') } },
        },
      },
    },
  },
  '/notifications/read-all': {
    post: {
      tags: ['Notifications'],
      security,
      summary: 'Mark all current user notifications as read',
      responses: {
        '200': response('NotificationReadAllResponse'),
        '401': errors['401'],
      },
    },
  },
};
