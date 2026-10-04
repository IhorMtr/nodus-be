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
  description: 'Trimmed and normalized to lowercase before use.',
  example: 'john@example.com',
};

const name: OpenAPIV3.SchemaObject = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  description: 'Leading and trailing whitespace is trimmed before validation.',
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
        description: 'At least 8 characters, one uppercase ASCII letter, and one digit. Special characters are optional. Whitespace is preserved.',
        example: 'Password1',
      },
      confirmPassword: {
        type: 'string',
        format: 'password',
        writeOnly: true,
        minLength: 1,
        maxLength: 128,
        description: 'Must equal password exactly. A mismatch produces a confirmPassword field error.',
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
        description: 'The existing password; whitespace is preserved.',
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
        description: 'The refresh JWT returned by registration, login, or the latest successful refresh. Send it only in this JSON body.',
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
        description: 'Access JWT valid for 15 minutes. Send only as Authorization: Bearer <accessToken> on protected routes.',
      },
      refreshToken: {
        type: 'string',
        description: 'Refresh JWT valid for 7 days. Send only in the JSON body of /auth/refresh or /auth/logout. Replaced on every refresh.',
      },
      expiresAt: {
        type: 'string',
        format: 'date-time',
        description: 'ISO 8601 UTC timestamp matching the access JWT exp claim.',
        example: '2026-10-03T14:15:00.000Z',
      },
    },
  }),
  LogoutResponse: successEnvelope({ type: 'object', nullable: true, enum: [null] }),
};

// ==================== OPERATIONS ====================

const badRequest = errorResponse(
  'Invalid fields or malformed JSON. Field errors are grouped by field name; request-level errors use _form.',
  ['ValidationFailed', 'InvalidJson'],
);
const unexpectedError = errorResponse('Unexpected server error.', ['InternalError']);
const rateLimit = errorResponse('Too many requests from this IP address.', ['TooManyRequests']);

export const authPaths: OpenAPIV3.PathsObject = {
  '/auth/register': {
    post: {
      tags: ['Auth'],
      operationId: 'register',
      summary: 'Register and create an authenticated session',
      description: 'Creates a user and session atomically, then returns access and refresh tokens in the JSON response body. No cookies are used. Limited to 10 requests per hour per IP address.',
      requestBody: requestBody('RegisterRequest'),
      responses: {
        '201': successResponse('User and session created. Tokens are returned in the JSON response body.'),
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
      summary: 'Sign in and create an authenticated session',
      description: 'Returns access and refresh tokens in the JSON response body. No cookies are used. Unknown email and incorrect password produce the same error. Limited to 30 requests per 15 minutes per IP address.',
      requestBody: requestBody('LoginRequest'),
      responses: {
        '200': successResponse('Authenticated. Tokens are returned in the JSON response body.'),
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
      summary: 'Rotate the refresh token and issue a new token pair',
      description: 'Accepts refreshToken only in the JSON request body. Verifies the token and active session, then atomically replaces the stored token fingerprint. The previous refresh token becomes unusable. Only one concurrent request with the same token can succeed. Returns both new tokens in JSON; no cookies are used.',
      requestBody: requestBody('RefreshTokenRequest'),
      responses: {
        '200': successResponse('Refresh token rotated. Replace both tokens on the client.'),
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
      summary: 'Revoke the session associated with a refresh token',
      description: 'Accepts refreshToken only in the JSON request body and identifies the session using its cryptographic fingerprint. An expired current refresh token can revoke its session. Repeated logout and unknown or previously rotated tokens safely succeed without changing another session. Existing access tokens remain valid until their 15-minute expiration. No cookies are used.',
      requestBody: requestBody('RefreshTokenRequest'),
      responses: {
        '200': successResponse('Logout completed. The operation is idempotent.', 'LogoutResponse'),
        '400': badRequest,
        '500': unexpectedError,
      },
    },
  },
};
