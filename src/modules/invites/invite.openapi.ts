import type { OpenAPIV3 } from 'openapi-types';

// ==================== HELPERS ====================

const ref = (name: string): OpenAPIV3.ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
const body = (name: string): OpenAPIV3.RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
const response = (
  description: string,
  name: string
): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema: ref(name) } },
});
const failure = (
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
const envelope = (
  data: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
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

export const inviteSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  InviteTokenRequest: {
    type: 'object',
    required: ['token'],
    additionalProperties: false,
    properties: { token: { type: 'string', minLength: 1, maxLength: 256 } },
  },
  WorkspaceInvite: {
    type: 'object',
    required: [
      'id',
      'workspaceId',
      'createdById',
      'expiresAt',
      'usedAt',
      'revokedAt',
      'createdAt',
      'status',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      workspaceId: { type: 'string', format: 'uuid' },
      createdById: { type: 'string', format: 'uuid' },
      expiresAt: { type: 'string', format: 'date-time' },
      usedAt: { type: 'string', format: 'date-time', nullable: true },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      status: {
        type: 'string',
        enum: ['active', 'used', 'revoked', 'expired'],
      },
    },
  },
  CreatedWorkspaceInvite: {
    type: 'object',
    required: [
      'id',
      'workspaceId',
      'createdById',
      'expiresAt',
      'usedAt',
      'revokedAt',
      'createdAt',
      'status',
      'token',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      workspaceId: { type: 'string', format: 'uuid' },
      createdById: { type: 'string', format: 'uuid' },
      expiresAt: { type: 'string', format: 'date-time' },
      usedAt: { type: 'string', format: 'date-time', nullable: true },
      revokedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      status: { type: 'string', enum: ['active'] },
      token: {
        type: 'string',
        description:
          'Raw token returned only when the invite is created. Store it securely; it cannot be retrieved again.',
      },
    },
  },
  ResolvedWorkspaceInvite: {
    type: 'object',
    required: ['id', 'name', 'expiresAt'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  },
  AcceptedWorkspaceInvite: {
    type: 'object',
    required: ['workspaceId', 'role'],
    additionalProperties: false,
    properties: {
      workspaceId: { type: 'string', format: 'uuid' },
      role: { type: 'string', enum: ['Member'] },
    },
  },
  CreateInviteResponse: envelope(ref('CreatedWorkspaceInvite')),
  ListInvitesResponse: envelope({
    type: 'array',
    items: ref('WorkspaceInvite'),
  }),
  ResolveInviteResponse: envelope(ref('ResolvedWorkspaceInvite')),
  AcceptInviteResponse: envelope(ref('AcceptedWorkspaceInvite')),
  RevokeInviteResponse: envelope({
    type: 'object',
    nullable: true,
    enum: [null],
  }),
};

// ==================== OPERATIONS ====================

const security = [{ bearerAuth: [] }];
const workspaceId: OpenAPIV3.ParameterObject = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const inviteId: OpenAPIV3.ParameterObject = {
  name: 'inviteId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};
const authFailure = failure(
  'Missing, invalid, or expired Bearer access token.',
  ['Unauthorized', 'AccessTokenExpired']
);
const validationFailure = failure('Invalid UUID or request body.', [
  'ValidationFailed',
  'InvalidJson',
]);
const inactiveFailure = failure('Invite is expired or revoked.', [
  'InviteExpired',
  'InviteRevoked',
]);

export const invitePaths: OpenAPIV3.PathsObject = {
  '/workspaces/{workspaceId}/invites': {
    parameters: [workspaceId],
    post: {
      tags: ['Invites'],
      operationId: 'createWorkspaceInvite',
      summary: 'Create a single use workspace invite',
      security,
      description:
        'Owner and Admin only. Expires after 7 days. The raw token appears only in this response; new members always receive Member role.',
      responses: {
        '201': response('Invite created.', 'CreateInviteResponse'),
        '400': validationFailure,
        '401': authFailure,
        '403': failure('Requires Owner or Admin.', [
          'InsufficientWorkspaceRole',
        ]),
        '404': failure('Workspace unavailable.', ['WorkspaceNotFound']),
      },
    },
    get: {
      tags: ['Invites'],
      operationId: 'listWorkspaceInvites',
      summary: 'List workspace invites',
      security,
      description:
        'Owner and Admin only. Tokens and token hashes are never returned.',
      responses: {
        '200': response('Workspace invites.', 'ListInvitesResponse'),
        '400': validationFailure,
        '401': authFailure,
        '403': failure('Requires Owner or Admin.', [
          'InsufficientWorkspaceRole',
        ]),
        '404': failure('Workspace unavailable.', ['WorkspaceNotFound']),
      },
    },
  },
  '/workspaces/{workspaceId}/invites/{inviteId}': {
    parameters: [workspaceId, inviteId],
    delete: {
      tags: ['Invites'],
      operationId: 'revokeWorkspaceInvite',
      summary: 'Revoke a workspace invite',
      security,
      description:
        'Owner and Admin only. Sets revokedAt without deleting the record.',
      responses: {
        '200': response('Invite revoked.', 'RevokeInviteResponse'),
        '400': validationFailure,
        '401': authFailure,
        '403': failure('Requires Owner or Admin.', [
          'InsufficientWorkspaceRole',
        ]),
        '404': failure('Workspace or invite unavailable.', [
          'WorkspaceNotFound',
          'InviteNotFound',
        ]),
        '409': failure('Invite already used.', ['InviteAlreadyUsed']),
        '410': failure('Invite already revoked.', ['InviteRevoked']),
      },
    },
  },
  '/invites/resolve': {
    post: {
      tags: ['Invites'],
      operationId: 'resolveWorkspaceInvite',
      summary: 'Resolve an invite token',
      security: [],
      description:
        'Public endpoint. Send the token in the JSON body, never in a URL or query parameter.',
      requestBody: body('InviteTokenRequest'),
      responses: {
        '200': response('Safe workspace details.', 'ResolveInviteResponse'),
        '400': validationFailure,
        '404': failure('Token not found.', ['InviteNotFound']),
        '409': failure('Token already used.', ['InviteAlreadyUsed']),
        '410': inactiveFailure,
      },
    },
  },
  '/invites/accept': {
    post: {
      tags: ['Invites'],
      operationId: 'acceptWorkspaceInvite',
      summary: 'Accept a single use invite',
      security,
      description:
        'Claims the invite and creates the authenticated user as a Member in one database transaction.',
      requestBody: body('InviteTokenRequest'),
      responses: {
        '200': response('Invite accepted.', 'AcceptInviteResponse'),
        '400': validationFailure,
        '401': authFailure,
        '404': failure('Token not found.', ['InviteNotFound']),
        '409': failure(
          'Token already used or user already belongs to the workspace.',
          ['InviteAlreadyUsed', 'AlreadyWorkspaceMember']
        ),
        '410': inactiveFailure,
      },
    },
  },
};
