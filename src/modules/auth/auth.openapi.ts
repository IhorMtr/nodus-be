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
  schemaName = 'AuthTokenResponse',
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
        value: {
          success: false,
          data: null,
          messageType: code,
          errors: code === 'ValidationFailed'
            ? { _form: ['Invalid request body'] }
            : null,
        },
      }])),
    },
  },
});

const successEnvelope = (data: OpenAPIV3.SchemaObject): OpenAPIV3.SchemaObject => ({
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

const email: OpenAPIV3.SchemaObject = {
  type: 'string',
  format: 'email',
  maxLength: 254,
  description: 'Trimmed and converted to lowercase.',
  example: 'john@example.com',
};

const name: OpenAPIV3.SchemaObject = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  description: 'Leading and trailing whitespace is trimmed.',
};

export const authSchemas: Record<string, OpenAPIV3.SchemaObject> = {
  RegisterRequest: {
    type: 'object',
    required: ['firstName', 'lastName', 'email', 'password', 'confirmPassword'],
    additionalProperties: false,
    properties: {
      firstName: { ...name, example: 'John' },
      lastName: { ...name, example: 'Doe' },
      email,
      password: {
        type: 'string',
        format: 'password',
        writeOnly: true,
        minLength: 8,
        maxLength: 128,
        pattern: '^(?=[\\s\\S]*[A-Z])(?=[\\s\\S]*[0-9])[\\s\\S]+$',
        description: 'At least 8 characters, with at least one uppercase ASCII letter and one digit.',
        example: 'Password1',
      },
      confirmPassword: {
        type: 'string',
        format: 'password',
        writeOnly: true,
        minLength: 1,
        maxLength: 128,
        description: 'Must match password exactly.',
        example: 'Password1',
      },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email,
      password: {
        type: 'string',
        format: 'password',
        writeOnly: true,
        minLength: 1,
        maxLength: 128,
        example: 'Password1',
      },
    },
  },
  RefreshTokenRequest: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
        writeOnly: true,
        description: 'Refresh token returned by registration, login, or refresh.',
      },
    },
  },
  AuthTokenResponse: successEnvelope({
    type: 'object',
    required: ['accessToken', 'refreshToken', 'expiresAt'],
    additionalProperties: false,
    properties: {
      accessToken: {
        type: 'string',
        description: 'JWT access token.',
      },
      refreshToken: {
        type: 'string',
        description: 'JWT refresh token. Expires after 7 days.',
      },
      expiresAt: {
        type: 'string',
        format: 'date-time',
        description: 'Access token expiration time in UTC.',
        example: '2026-10-03T14:15:00.000Z',
      },
    },
  }),
  LogoutResponse: successEnvelope({ type: 'object', nullable: true, enum: [null] }),
};

// ==================== OPERATIONS ====================

const badRequest = errorResponse(
  'Invalid request body.',
  ['ValidationFailed', 'InvalidJson'],
);
const unexpectedError = errorResponse('Unexpected server error.', ['InternalError']);
const rateLimit = errorResponse('Rate limit exceeded.', ['TooManyRequests']);

export const authPaths: OpenAPIV3.PathsObject = {
  '/auth/register': {
    post: {
      tags: ['Auth'],
      operationId: 'register',
      summary: 'Register an account',
      description: 'Creates an account and returns access and refresh tokens.',
      requestBody: requestBody('RegisterRequest'),
      responses: {
        '201': successResponse('Account and session created.'),
        '400': badRequest,
        '409': errorResponse('An account already uses this email address.', ['EmailAlreadyExists']),
        '429': rateLimit,
        '500': unexpectedError,
      },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Log in',
      description: 'Creates a session and returns access and refresh tokens.',
      requestBody: requestBody('LoginRequest'),
      responses: {
        '200': successResponse('Authentication succeeded.'),
        '400': badRequest,
        '401': errorResponse('Invalid email or password.', ['InvalidCredentials']),
        '429': rateLimit,
        '500': unexpectedError,
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      operationId: 'refresh',
      summary: 'Refresh tokens',
      description: 'Validates a refresh token and issues a new token pair.',
      requestBody: requestBody('RefreshTokenRequest'),
      responses: {
        '200': successResponse('Refresh token rotated.'),
        '400': badRequest,
        '401': errorResponse('Refresh token or session is invalid.', [
          'InvalidRefreshToken', 'RefreshTokenExpired', 'SessionRevoked', 'RefreshTokenReused',
        ]),
        '500': unexpectedError,
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Log out',
      description: 'Revokes the session associated with the submitted current refresh token.',
      requestBody: requestBody('RefreshTokenRequest'),
      responses: {
        '200': successResponse('Logout request completed.', 'LogoutResponse'),
        '400': badRequest,
        '500': unexpectedError,
      },
    },
  },
};
