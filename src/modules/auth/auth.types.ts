import type { z } from 'zod';

import type { loginSchema, registerSchema } from './auth.schema.js';

// ==================== REQUEST TYPES ====================

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// ==================== RESPONSE AND AUTH TYPES ====================

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

export type AuthContext = {
  userId: string;
};
