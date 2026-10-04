import type { ApiResponse, FieldErrors } from '../types/api-response.js';

export function successResponse<T>(data: T): ApiResponse<T> {
  return { success: true, data, messageType: null, errors: null };
}

export function errorResponse(messageType: string, errors: FieldErrors | null = null): ApiResponse<never> {
  return { success: false, data: null, messageType, errors };
}
