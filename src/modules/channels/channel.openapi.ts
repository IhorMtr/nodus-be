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
  description: 'Invalid UUID path parameters or request body. Validation errors are grouped by field; request-level errors, including unknown body fields, use _form.',
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

const channelName: OpenAPIV3.SchemaObject = {
  type: 'string',
  minLength: 1,
  maxLength: 80,
  description: 'Leading and trailing whitespace is trimmed before length validation. Spaces are allowed, but a whitespace-only name is invalid. Names are unique within a workspace, ignoring case.',
  example: 'General',
};

export const channelSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  Channel: {
    type: 'object',
    required: ['id', 'workspaceId', 'name', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      workspaceId: { type: 'string', format: 'uuid' },
      name: channelName,
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateChannelRequest: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: channelName },
  },
  UpdateChannelRequest: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: { ...channelName, example: 'Backend' } },
  },
  ChannelResponse: successEnvelope(schemaRef('Channel')),
  ChannelListResponse: successEnvelope({ type: 'array', items: schemaRef('Channel') }),
  ChannelDeleteResponse: successEnvelope({ type: 'object', nullable: true, enum: [null] }),
};

// ==================== OPERATIONS ====================

const protectedOperation = {
  tags: ['Channels'],
  security: [{ bearerAuth: [] }],
};

const authenticatedResponses: OpenAPIV3.ResponsesObject = {
  '401': errorResponse('Missing, invalid, or expired Bearer access token. Refresh tokens cannot authorize this endpoint.', [
    'Unauthorized', 'AccessTokenExpired',
  ]),
  '500': errorResponse('Unexpected server error.', ['InternalError']),
};

const workspaceNotFound = errorResponse(
  'The workspace does not exist, or the authenticated user is not a member. Both cases return the same response to protect workspace privacy.',
  ['WorkspaceNotFound'],
);

const channelNotFound = errorResponse(
  'The workspace is unavailable to the authenticated user, or the channel does not exist within the workspace specified in the URL. Membership is checked before channel lookup.',
  ['WorkspaceNotFound', 'ChannelNotFound'],
);

const insufficientRole = errorResponse(
  'The authenticated user is a workspace Member. Only Owner and Admin can create, rename, or delete channels.',
  ['InsufficientWorkspaceRole'],
);

const duplicateName = errorResponse(
  'Another channel in this workspace already uses the name, ignoring case. The database enforces uniqueness, including concurrent create and rename requests.',
  ['ChannelNameAlreadyExists'],
);

const workspaceIdParameter: OpenAPIV3.ParameterObject = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  description: 'Workspace UUID.',
  schema: { type: 'string', format: 'uuid' },
};

const channelIdParameter: OpenAPIV3.ParameterObject = {
  name: 'channelId',
  in: 'path',
  required: true,
  description: 'UUID of a channel belonging to the workspace specified in the URL.',
  schema: { type: 'string', format: 'uuid' },
};

const invalidWorkspaceId = { workspaceId: ['Invalid UUID'] };
const invalidChannelParams = { ...invalidWorkspaceId, channelId: ['Invalid UUID'] };

export const channelPaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/channels': {
    parameters: [workspaceIdParameter],
    post: {
      ...protectedOperation,
      operationId: 'createChannel',
      summary: 'Create a workspace channel',
      description: 'Available to Owner and Admin. The channel belongs to this workspace and is readable by every workspace member. The name is required; empty bodies and unknown fields are rejected. Channels are created explicitly; creating a workspace does not create a default channel.',
      requestBody: requestBody('CreateChannelRequest'),
      responses: {
        ...authenticatedResponses,
        '201': successResponse('Channel created.', 'ChannelResponse'),
        '400': validationResponse({ ...invalidWorkspaceId, name: ['Name is required'] }, true),
        '403': insufficientRole,
        '404': workspaceNotFound,
        '409': duplicateName,
      },
    },
    get: {
      ...protectedOperation,
      operationId: 'listChannels',
      summary: 'List workspace channels',
      description: 'Available to Owner, Admin, and Member. Returns only channels belonging to this workspace, ordered by createdAt ascending, then id ascending. Returns an empty array when the workspace has no channels.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace channels.', 'ChannelListResponse'),
        '400': validationResponse(invalidWorkspaceId),
        '404': workspaceNotFound,
      },
    },
  },
  '/workspaces/{workspaceId}/channels/{channelId}': {
    parameters: [workspaceIdParameter, channelIdParameter],
    get: {
      ...protectedOperation,
      operationId: 'getChannel',
      summary: 'Get a workspace channel',
      description: 'Available to Owner, Admin, and Member. A channel must belong to the workspace specified in the URL; a channel from another workspace returns ChannelNotFound.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Channel details.', 'ChannelResponse'),
        '400': validationResponse(invalidChannelParams),
        '404': channelNotFound,
      },
    },
    patch: {
      ...protectedOperation,
      operationId: 'updateChannel',
      summary: 'Rename a workspace channel',
      description: 'Available to Owner and Admin. The name is required; empty bodies and unknown fields are rejected. Names are unique within this workspace, ignoring case. Keeping the current name or changing only its case is allowed. A channel from another workspace returns ChannelNotFound.',
      requestBody: requestBody('UpdateChannelRequest'),
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Channel updated.', 'ChannelResponse'),
        '400': validationResponse({ ...invalidChannelParams, name: ['Name is required'] }, true),
        '403': insufficientRole,
        '404': channelNotFound,
        '409': duplicateName,
      },
    },
    delete: {
      ...protectedOperation,
      operationId: 'deleteChannel',
      summary: 'Delete a workspace channel',
      description: 'Available to Owner and Admin. Permanently deletes the channel. A channel from another workspace returns ChannelNotFound. Successful deletion returns the unified response envelope with data set to null.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Channel deleted.', 'ChannelDeleteResponse'),
        '400': validationResponse(invalidChannelParams),
        '403': insufficientRole,
        '404': channelNotFound,
      },
    },
  },
};
