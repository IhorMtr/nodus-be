import { argon2id } from 'argon2';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const LOGIN_LIMIT = 30;
export const LOGIN_WINDOW_MS = 15 * 60 * 1_000;
export const REGISTER_LIMIT = 10;
export const REGISTER_WINDOW_MS = 60 * 60 * 1_000;
