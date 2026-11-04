import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  registerSchema,
} from '../../src/modules/auth/auth.schema.js';

// ==================== REGISTRATION ====================

describe('registerSchema', () => {
  const validRegistration = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: ' ADA@EXAMPLE.COM ',
    password: 'Password1',
    confirmPassword: 'Password1',
  };

  it('accepts valid data and normalizes names and email', () => {
    const input = { ...validRegistration, firstName: ' Ada ' };

    const result = registerSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Ada');
      expect(result.data.email).toBe('ada@example.com');
    }
  });

  it('accepts the password length boundaries when complexity rules pass', () => {
    const password = `A1${'x'.repeat(126)}`;

    const result = registerSchema.safeParse({
      ...validRegistration,
      password,
      confirmPassword: password,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than eight characters', () => {
    const input = {
      ...validRegistration,
      password: 'Aa12345',
      confirmPassword: 'Aa12345',
    };

    const result = registerSchema.safeParse(input);

    expect(result.success).toBe(false);
  });

  it('rejects passwords without an uppercase letter or digit', () => {
    const cases = ['password1', 'Password'];

    const results = cases.map(password =>
      registerSchema.safeParse({
        ...validRegistration,
        password,
        confirmPassword: password,
      })
    );

    expect(results.every(result => !result.success)).toBe(true);
  });

  it('rejects mismatched confirmation and unknown fields', () => {
    const mismatch = { ...validRegistration, confirmPassword: 'Different1' };
    const extraField = { ...validRegistration, isAdmin: true };

    const mismatchResult = registerSchema.safeParse(mismatch);
    const extraFieldResult = registerSchema.safeParse(extraField);

    expect(mismatchResult.success).toBe(false);
    expect(extraFieldResult.success).toBe(false);
  });

  it('rejects blank names and malformed email addresses', () => {
    const blankName = { ...validRegistration, firstName: '   ' };
    const invalidEmail = { ...validRegistration, email: 'not-an-email' };

    const blankNameResult = registerSchema.safeParse(blankName);
    const invalidEmailResult = registerSchema.safeParse(invalidEmail);

    expect(blankNameResult.success).toBe(false);
    expect(invalidEmailResult.success).toBe(false);
  });
});

// ==================== LOGIN ====================

describe('loginSchema', () => {
  it('normalizes email and accepts a non-empty password', () => {
    const input = { email: ' ADA@EXAMPLE.COM ', password: 'anything' };

    const result = loginSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('ada@example.com');
    }
  });

  it('rejects missing passwords and malformed email addresses', () => {
    const missingPassword = loginSchema.safeParse({
      email: 'ada@example.com',
      password: '',
    });
    const invalidEmail = loginSchema.safeParse({
      email: 'invalid',
      password: 'secret',
    });

    const results = [missingPassword, invalidEmail];

    expect(results.every(result => !result.success)).toBe(true);
  });
});
