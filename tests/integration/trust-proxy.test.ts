import type { Express } from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ==================== HELPERS ====================

async function loadApp(hops: string | undefined): Promise<Express> {
  vi.resetModules();
  if (hops === undefined) {
    delete process.env['TRUST_PROXY_HOPS'];
  } else {
    process.env['TRUST_PROXY_HOPS'] = hops;
  }
  return (await import('../../src/app.js')).app;
}

async function remaining(app: Express, forwardedFor: string): Promise<number> {
  const response = await request(app)
    .post('/auth/register')
    .set('X-Forwarded-For', forwardedFor)
    .send({});
  expect(response.status).toBe(400);
  const header = response.get('RateLimit') ?? '';
  const match = /r=(\d+)/.exec(header);
  if (!match) {
    throw new Error(`Missing RateLimit header: ${header}`);
  }
  return Number(match[1]);
}

afterEach(() => {
  delete process.env['TRUST_PROXY_HOPS'];
  vi.resetModules();
});

// ==================== TESTS ====================

describe('trust proxy', () => {
  it('keys rate limits by the client IP appended by one trusted proxy', async () => {
    const app = await loadApp('1');
    expect(app.get('trust proxy')).toBe(1);

    const first = await remaining(app, '203.0.113.10');
    expect(await remaining(app, '203.0.113.10')).toBe(first - 1);
    expect(await remaining(app, '203.0.113.20')).toBe(first);
    expect(await remaining(app, '198.51.100.1, 203.0.113.20')).toBe(first - 1);
  });

  it('ignores X-Forwarded-For when no proxy is trusted', async () => {
    const app = await loadApp(undefined);
    expect(app.get('trust proxy')).toBe(0);

    const first = await remaining(app, '203.0.113.10');
    expect(await remaining(app, '203.0.113.20')).toBe(first - 1);
  });

  it('rejects a hop count that is not a non-negative integer', async () => {
    await expect(loadApp('true')).rejects.toThrow(/TRUST_PROXY_HOPS/);
    await expect(loadApp('-1')).rejects.toThrow(/TRUST_PROXY_HOPS/);
  });
});
