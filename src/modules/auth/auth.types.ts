import type { z } from 'zod';

import type { loginSchema, registerSchema } from './auth.schema.js';

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type AuthContext = {
  userId: string;
};
