import { z } from 'zod';

// ==================== FIELD SCHEMAS ====================

const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name must not exceed 100 characters');
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email('Invalid email address'));
const passwordSchema = z.string()
  .min(8, 'Password must contain at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit');

// ==================== REQUEST SCHEMAS ====================

export const registerSchema = z.strictObject({
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required').max(128),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(1, 'Refresh token is required').max(4096),
});
