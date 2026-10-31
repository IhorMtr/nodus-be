import type { OpenAPIV3 } from 'openapi-types';

// ==================== HELPERS ====================

const ref = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
const envelope = (
  data: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
): OpenAPIV3.SchemaObject => ({
  type: 'object',
  required: ['success', 'data', 'messageType', 'errors'],
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', enum: [true] },
    data,
    messageType: { type: 'string', nullable: true },
    errors: { type: 'object', nullable: true },
  },
});
const response = (
  description: string,
  name: string
): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});
const error = (
  description: string,
  codes: string[]
): OpenAPIV3.ResponseObject => ({
  description,
  content: {
    'application/json': {
      schema: ref('ApiErrorResponse'),
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
const request = (name: string): OpenAPIV3.RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
const dateTime: OpenAPIV3.SchemaObject = {
  type: 'string',
  format: 'date-time',
};
const publishAt: OpenAPIV3.SchemaObject = {
  ...dateTime,
  description:
    'Future ISO 8601 date-time with a timezone offset. Omit on create for immediate publication; set null on a scheduled announcement to publish immediately.',
};
const authentication = {
  tags: ['Announcements'],
  security: [{ bearerAuth: [] }],
};
const common = {
  '401': error('Missing, invalid, or expired access token.', [
    'Unauthorized',
    'AccessTokenExpired',
  ]),
  '400': error('Invalid UUID, body, JSON, or publishAt in the past.', [
    'ValidationFailed',
    'InvalidJson',
    'InvalidPublishAt',
  ]),
  '404': error(
    'Workspace does not exist or the user is an outsider. An announcement may also be absent or invisible to a Member.',
    ['WorkspaceNotFound', 'AnnouncementNotFound']
  ),
  '500': error('Unexpected server error.', ['InternalError']),
};
const roleError = error('Only Owner and Admin can write announcements.', [
  'InsufficientWorkspaceRole',
]);
const workspaceId: OpenAPIV3.ParameterObject = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const announcementId: OpenAPIV3.ParameterObject = {
  name: 'announcementId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

// ==================== SCHEMAS ====================

export const announcementSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  Announcement: {
    type: 'object',
    additionalProperties: false,
    required: [
      'id',
      'workspaceId',
      'authorId',
      'title',
      'content',
      'publishAt',
      'publishedAt',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      workspaceId: { type: 'string', format: 'uuid' },
      authorId: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      content: { type: 'string' },
      publishAt: { ...dateTime, nullable: true },
      publishedAt: { ...dateTime, nullable: true },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },
  CreateAnnouncementRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'content'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      content: { type: 'string', minLength: 1, maxLength: 4000 },
      publishAt,
    },
  },
  UpdateAnnouncementRequest: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      content: { type: 'string', minLength: 1, maxLength: 4000 },
      publishAt: { ...publishAt, nullable: true },
    },
  },
  AnnouncementResponse: envelope(ref('Announcement')),
  AnnouncementListResponse: envelope({
    type: 'array',
    items: ref('Announcement'),
  }),
  AnnouncementDeleteResponse: envelope({
    type: 'object',
    nullable: true,
    enum: [null],
  }),
};

// ==================== OPERATIONS ====================

export const announcementPaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/announcements': {
    parameters: [workspaceId],
    post: {
      ...authentication,
      operationId: 'createAnnouncement',
      summary: 'Create an announcement',
      description:
        'Owner and Admin only. Without publishAt, publishes immediately. With a future publishAt, stores an unpublished announcement and schedules a BullMQ job. The worker retries and reconciles jobs from PostgreSQL after outages.',
      requestBody: request('CreateAnnouncementRequest'),
      responses: {
        ...common,
        '201': response('Announcement created.', 'AnnouncementResponse'),
        '403': roleError,
      },
    },
    get: {
      ...authentication,
      operationId: 'listAnnouncements',
      summary: 'List workspace announcements',
      description:
        'Owner and Admin see published and scheduled announcements; Member sees only published announcements. Ordered by createdAt descending, then id descending.',
      responses: {
        ...common,
        '200': response('Workspace announcements.', 'AnnouncementListResponse'),
      },
    },
  },
  '/workspaces/{workspaceId}/announcements/{announcementId}': {
    parameters: [workspaceId, announcementId],
    get: {
      ...authentication,
      operationId: 'getAnnouncement',
      summary: 'Get an announcement',
      description:
        'Owner and Admin can read unpublished announcements. Member receives AnnouncementNotFound for unpublished announcements.',
      responses: {
        ...common,
        '200': response('Announcement details.', 'AnnouncementResponse'),
      },
    },
    patch: {
      ...authentication,
      operationId: 'updateAnnouncement',
      summary: 'Edit or reschedule an announcement',
      description:
        'Owner and Admin only. A future publishAt reschedules an unpublished announcement; null publishes it immediately. Omitted publishAt preserves its schedule. Published announcements can edit title and content but cannot be scheduled again.',
      requestBody: request('UpdateAnnouncementRequest'),
      responses: {
        ...common,
        '200': response('Announcement updated.', 'AnnouncementResponse'),
        '403': roleError,
        '409': error('Announcement was published or changed concurrently.', [
          'AnnouncementAlreadyPublished',
          'AnnouncementConflict',
        ]),
      },
    },
    delete: {
      ...authentication,
      operationId: 'deleteAnnouncement',
      summary: 'Delete an announcement',
      description:
        'Owner and Admin only. Deletes the row; a delayed job cannot publish a deleted announcement.',
      responses: {
        ...common,
        '200': response('Announcement deleted.', 'AnnouncementDeleteResponse'),
        '403': roleError,
      },
    },
  },
};
