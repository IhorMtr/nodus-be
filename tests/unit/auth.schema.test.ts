import { describe, expect, it } from 'vitest';
import { loginSchema, registerSchema } from '../../src/modules/auth/auth.schema.js';

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
    // Arrange
    const input = { ...validRegistration, firstName: ' Ada ' };

    // Act
    const result = registerSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe('Ada');
      expect(result.data.email).toBe('ada@example.com');
    }
  });

  it('accepts the password length boundaries when complexity rules pass', () => {
    // Arrange
    const password = `A1${'x'.repeat(126)}`;

    // Act
    const result = registerSchema.safeParse({
      ...validRegistration,
      password,
      confirmPassword: password,
    });

    // Assert
    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than eight characters', () => {
    // Arrange
    const input = { ...validRegistration, password: 'Aa12345', confirmPassword: 'Aa12345' };

    // Act
    const result = registerSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(false);
  });

  it('rejects passwords without an uppercase letter or digit', () => {
    // Arrange
    const cases = ['password1', 'Password'];

    // Act
    const results = cases.map((password) => registerSchema.safeParse({
      ...validRegistration,
      password,
      confirmPassword: password,
    }));

    // Assert
    expect(results.every((result) => !result.success)).toBe(true);
  });

  it('rejects mismatched confirmation and unknown fields', () => {
    // Arrange
    const mismatch = { ...validRegistration, confirmPassword: 'Different1' };
    const extraField = { ...validRegistration, isAdmin: true };

    // Act
    const mismatchResult = registerSchema.safeParse(mismatch);
    const extraFieldResult = registerSchema.safeParse(extraField);

    // Assert
    expect(mismatchResult.success).toBe(false);
    expect(extraFieldResult.success).toBe(false);
  });

  it('rejects blank names and malformed email addresses', () => {
    // Arrange
    const blankName = { ...validRegistration, firstName: '   ' };
    const invalidEmail = { ...validRegistration, email: 'not-an-email' };

    // Act
    const blankNameResult = registerSchema.safeParse(blankName);
    const invalidEmailResult = registerSchema.safeParse(invalidEmail);

    // Assert
    expect(blankNameResult.success).toBe(false);
    expect(invalidEmailResult.success).toBe(false);
  });
});

// ==================== LOGIN ====================

describe('loginSchema', () => {
  it('normalizes email and accepts a non-empty password', () => {
    // Arrange
    const input = { email: ' ADA@EXAMPLE.COM ', password: 'anything' };

    // Act
    const result = loginSchema.safeParse(input);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe('ada@example.com');
  });

  it('rejects missing passwords and malformed email addresses', () => {
    // Arrange
    const missingPassword = loginSchema.safeParse({ email: 'ada@example.com', password: '' });
    const invalidEmail = loginSchema.safeParse({ email: 'invalid', password: 'secret' });

    // Act
    const results = [missingPassword, invalidEmail];

    // Assert
    expect(results.every((result) => !result.success)).toBe(true);
  });
});
