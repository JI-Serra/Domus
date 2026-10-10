// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportToken } from '@/test/support-token';

const cookieJar = new Map<string, string>();
const createSupportClient = vi.fn<(...args: unknown[]) => object>(() => ({
  kind: 'support',
}));
const createServerClient = vi.fn<(...args: unknown[]) => object>(() => ({
  kind: 'actor',
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      set: vi.fn(),
    }),
}));
vi.mock('@domus/supabase/platform', () => ({
  createSupportClient: (...args: unknown[]) => createSupportClient(...args),
}));
vi.mock('@domus/supabase/server', () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));
vi.mock('@domus/supabase/env', () => ({
  getSupabaseEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'http://api.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  }),
}));

const { createActorRequestClient, createRequestClient } =
  await import('./request-client');

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
});

describe('createRequestClient', () => {
  it('is the signed-in user’s own client normally', async () => {
    await expect(createRequestClient()).resolves.toEqual({ kind: 'actor' });
    expect(createSupportClient).not.toHaveBeenCalled();
  });

  it('is the support client, with the token from the httpOnly cookie, during a support session', async () => {
    const token = supportToken();
    cookieJar.set('domus-support', token);
    await expect(createRequestClient()).resolves.toEqual({ kind: 'support' });
    expect(createSupportClient).toHaveBeenCalledWith(
      'http://api.test',
      'anon',
      token,
    );
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('ignores an expired or malformed support cookie', async () => {
    cookieJar.set('domus-support', supportToken({}, -10));
    await expect(createRequestClient()).resolves.toEqual({ kind: 'actor' });
    cookieJar.set('domus-support', 'junk');
    await expect(createRequestClient()).resolves.toEqual({ kind: 'actor' });
  });

  it('always offers the admin’s own client for ending a session', async () => {
    cookieJar.set('domus-support', supportToken());
    await expect(createActorRequestClient()).resolves.toEqual({
      kind: 'actor',
    });
  });

  it('lets the actor client write refreshed cookies, and tolerates read-only contexts', async () => {
    await createActorRequestClient();
    const adapter = createServerClient.mock.calls[0]?.[0] as {
      getAll: () => unknown[];
      setAll: (
        items: { name: string; value: string; options: object }[],
      ) => void;
    };
    expect(adapter.getAll()).toEqual([]);
    expect(() =>
      adapter.setAll([{ name: 'sb', value: 'v', options: {} }]),
    ).not.toThrow();
  });
});
