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
  description: 'Invalid UUID path parameters or request body. Validation errors are grouped by field; request-level errors use _form.',
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

const workspaceName: OpenAPIV3.SchemaObject = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  description: 'Leading and trailing whitespace is trimmed before length validation. A whitespace-only name is invalid.',
  example: 'My Workspace',
};

const role: OpenAPIV3.SchemaObject = {
  type: 'string',
  enum: ['Owner', 'Admin', 'Member'],
};

export const workspaceSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  Workspace: {
    type: 'object',
    required: ['id', 'name', 'role', 'createdAt', 'updatedAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: workspaceName,
      role: { ...role, description: 'Role of the authenticated user in this workspace.' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  WorkspaceMember: {
    type: 'object',
    required: ['userId', 'firstName', 'lastName', 'email', 'role', 'joinedAt'],
    additionalProperties: false,
    properties: {
      userId: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', example: 'John' },
      lastName: { type: 'string', example: 'Doe' },
      email: { type: 'string', format: 'email', example: 'john@example.com' },
      role,
      joinedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateWorkspaceRequest: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: workspaceName },
  },
  UpdateWorkspaceRequest: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: { name: workspaceName },
  },
  UpdateWorkspaceMemberRoleRequest: {
    type: 'object',
    required: ['role'],
    additionalProperties: false,
    properties: {
      role: {
        type: 'string',
        enum: ['Admin', 'Member'],
        description: 'Only the Owner can assign roles. Assigning Owner or changing the existing Owner is prohibited.',
        example: 'Admin',
      },
    },
  },
  WorkspaceResponse: successEnvelope(schemaRef('Workspace')),
  WorkspaceListResponse: successEnvelope({ type: 'array', items: schemaRef('Workspace') }),
  WorkspaceMemberResponse: successEnvelope(schemaRef('WorkspaceMember')),
  WorkspaceMembersResponse: successEnvelope({ type: 'array', items: schemaRef('WorkspaceMember') }),
  WorkspaceDeleteResponse: successEnvelope({ type: 'object', nullable: true, enum: [null] }),
};

// ==================== OPERATIONS ====================

const protectedOperation = {
  tags: ['Workspaces'],
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

const memberNotFound = errorResponse(
  'The workspace is unavailable to the authenticated user, or the target user is not a member of this workspace.',
  ['WorkspaceNotFound', 'MemberNotFound'],
);

const insufficientRole = errorResponse(
  'The authenticated user is a member but does not have the required workspace role.',
  ['InsufficientWorkspaceRole'],
);

const workspaceConflict = errorResponse(
  'A concurrent workspace change could not be completed after bounded retries. Retry the request.',
  ['WorkspaceConflict'],
);

const workspaceIdParameter: OpenAPIV3.ParameterObject = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  description: 'Workspace UUID.',
  schema: { type: 'string', format: 'uuid' },
};

const userIdParameter: OpenAPIV3.ParameterObject = {
  name: 'userId',
  in: 'path',
  required: true,
  description: 'UUID of the user whose workspace membership is being managed.',
  schema: { type: 'string', format: 'uuid' },
};

const invalidWorkspaceId = { workspaceId: ['Invalid UUID'] };
const invalidMemberParams = { ...invalidWorkspaceId, userId: ['Invalid UUID'] };

export const workspacePaths: OpenAPIV3.PathsObject = {
  '/workspaces': {
    post: {
      ...protectedOperation,
      operationId: 'createWorkspace',
      summary: 'Create a workspace',
      description: 'Any authenticated user can create a workspace. The workspace and the creator\'s Owner membership are created atomically. Each workspace has one Owner.',
      requestBody: requestBody('CreateWorkspaceRequest'),
      responses: {
        ...authenticatedResponses,
        '201': successResponse('Workspace created; the current user has the Owner role.', 'WorkspaceResponse'),
        '400': validationResponse({ name: ['Name is required'] }, true),
      },
    },
    get: {
      ...protectedOperation,
      operationId: 'listWorkspaces',
      summary: 'List the current user\'s workspaces',
      description: 'Returns only workspaces where the authenticated user is an Owner, Admin, or Member, with that user\'s role. Ordered by createdAt descending, then id descending. Returns an empty array when the user has no workspaces.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspaces available to the current user.', 'WorkspaceListResponse'),
      },
    },
  },
  '/workspaces/{workspaceId}': {
    parameters: [workspaceIdParameter],
    get: {
      ...protectedOperation,
      operationId: 'getWorkspace',
      summary: 'Get a workspace',
      description: 'Available to Owner, Admin, and Member. The response includes the authenticated user\'s role.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace details.', 'WorkspaceResponse'),
        '400': validationResponse(invalidWorkspaceId),
        '404': workspaceNotFound,
      },
    },
    patch: {
      ...protectedOperation,
      operationId: 'updateWorkspace',
      summary: 'Rename a workspace',
      description: 'Available to Owner and Admin. The name is required; empty bodies and unknown fields are rejected.',
      requestBody: requestBody('UpdateWorkspaceRequest'),
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace updated.', 'WorkspaceResponse'),
        '400': validationResponse({ ...invalidWorkspaceId, name: ['Name is required'] }, true),
        '403': insufficientRole,
        '404': workspaceNotFound,
        '409': workspaceConflict,
      },
    },
    delete: {
      ...protectedOperation,
      operationId: 'deleteWorkspace',
      summary: 'Delete a workspace',
      description: 'Available only to Owner. Deletes the workspace and all its memberships atomically.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace and memberships deleted.', 'WorkspaceDeleteResponse'),
        '400': validationResponse(invalidWorkspaceId),
        '403': insufficientRole,
        '404': workspaceNotFound,
        '409': workspaceConflict,
      },
    },
  },
  '/workspaces/{workspaceId}/members': {
    parameters: [workspaceIdParameter],
    get: {
      ...protectedOperation,
      operationId: 'listWorkspaceMembers',
      summary: 'List workspace members',
      description: 'Available to Owner, Admin, and Member. Returns public member data ordered by joinedAt ascending, then userId ascending. Password hashes, sessions, and tokens are never included.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace members.', 'WorkspaceMembersResponse'),
        '400': validationResponse(invalidWorkspaceId),
        '404': workspaceNotFound,
        '409': workspaceConflict,
      },
    },
  },
  '/workspaces/{workspaceId}/members/{userId}/role': {
    parameters: [workspaceIdParameter, userIdParameter],
    patch: {
      ...protectedOperation,
      operationId: 'updateWorkspaceMemberRole',
      summary: 'Change a workspace member\'s role',
      description: 'Available only to Owner. Promote Member to Admin or demote Admin to Member; assigning the existing role is also accepted. The Owner\'s role cannot be changed, including by the Owner. Assigning Owner is a validation error. Ownership transfer is not supported.',
      requestBody: requestBody('UpdateWorkspaceMemberRoleRequest'),
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Updated workspace membership.', 'WorkspaceMemberResponse'),
        '400': validationResponse({ ...invalidMemberParams, role: ['Role must be Admin or Member'] }, true),
        '403': errorResponse('Only Owner can change roles, and the Owner membership cannot be changed.', [
          'InsufficientWorkspaceRole', 'OwnerRoleProtected',
        ]),
        '404': memberNotFound,
        '409': workspaceConflict,
      },
    },
  },
  '/workspaces/{workspaceId}/members/{userId}': {
    parameters: [workspaceIdParameter, userIdParameter],
    delete: {
      ...protectedOperation,
      operationId: 'removeWorkspaceMember',
      summary: 'Remove a workspace member',
      description: 'Owner can remove Admin and Member. Admin can remove only Member. Members cannot remove users. The Owner cannot be removed. Self-removal is prohibited; removing yourself as Owner returns OwnerRoleProtected. Leaving a workspace is not supported.',
      responses: {
        ...authenticatedResponses,
        '200': successResponse('Workspace membership removed.', 'WorkspaceDeleteResponse'),
        '400': validationResponse(invalidMemberParams),
        '403': errorResponse('The current role cannot remove this member, the target is Owner, or the request attempts self-removal.', [
          'InsufficientWorkspaceRole', 'OwnerRoleProtected', 'CannotRemoveSelf',
        ]),
        '404': memberNotFound,
        '409': workspaceConflict,
      },
    },
  },
};
