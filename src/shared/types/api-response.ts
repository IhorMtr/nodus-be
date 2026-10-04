export type FieldErrors = Record<string, string[]>;

export type ApiResponse<T> =
  | { success: true; data: T; messageType: null; errors: null }
  | { success: false; data: null; messageType: string; errors: FieldErrors | null };
