import type { FieldErrors } from '../types/api-response.js';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code = 'ApplicationError',
    public readonly fieldErrors: FieldErrors | null = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
