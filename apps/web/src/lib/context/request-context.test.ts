// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportToken } from '@/test/support-token';

const cookieJar = new Map<string, string>();
const loadResolvedContext = vi.fn();
const getSessionIdentity = vi.fn();
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  // `cache` memoizes per request; every call here is its own request.
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    }),
}));
vi.mock('@domus/supabase/session', () => ({
  getSessionIdentity: (...args: unknown[]) => getSessionIdentity(...args),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve({ kind: 'client' }),
}));
vi.mock('./load', () => ({
  loadResolvedContext: (input: unknown) => loadResolvedContext(input),
}));

const { getRequestContext, getRequestIdentity, getSupportSession } =
  await import('./request-context');

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  loadResolvedContext.mockResolvedValue({
    active: null,
    options: [],
    platformMfaStep: null,
  });
});

describe('request identity and context', () => {
  it('uses the verified session normally', async () => {
    getSessionIdentity.mockResolvedValue({
      userId: 'admin',
      email: 'a@b.c',
      aal: 'aal2',
    });
    cookieJar.set('domus-context', 'm1');
    const request = await getRequestContext();
    expect(request?.identity.userId).toBe('admin');
    expect(request?.support).toBeNull();
    expect(loadResolvedContext).toHaveBeenCalledWith(
      expect.objectContaining({ requestedContextId: 'm1' }),
    );
    expect(loadResolvedContext.mock.calls[0]?.[0]).not.toHaveProperty(
      'hasVerifiedFactor',
    );
  });

  it('is the target user at aal1 during a support session, without asking the auth session', async () => {
    cookieJar.set('domus-support', supportToken());
    await expect(getSupportSession()).resolves.toMatchObject({
      claims: { sub: 'target-user' },
    });
    await expect(getRequestIdentity()).resolves.toEqual({
      userId: 'target-user',
      email: null,
      aal: 'aal1',
    });
    const request = await getRequestContext();
    expect(request?.support?.claims.support_tenant_id).toBe('tenant-1');
    expect(getSessionIdentity).not.toHaveBeenCalled();
    expect(loadResolvedContext).toHaveBeenCalledWith(
      expect.objectContaining({ hasVerifiedFactor: false }),
    );
  });

  it('is null for nobody', async () => {
    getSessionIdentity.mockResolvedValue(null);
    await expect(getRequestContext()).resolves.toBeNull();
  });
});
