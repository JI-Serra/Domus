// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.fn();
const loadResolvedContext = vi.fn();
/** Whether the user has a verified factor (what `listFactors` reports). */
let hasFactor = false;
let cookieWriter: ((items: unknown[], headers: unknown) => void) | undefined;

vi.mock('@domus/supabase/server', () => ({
  createServerClient: (adapter: { setAll: typeof cookieWriter }) => {
    cookieWriter = adapter.setAll;
    return {
      kind: 'client',
      auth: {
        mfa: {
          listFactors: () =>
            Promise.resolve({
              data: { totp: hasFactor ? [{ id: 'f1' }] : [] },
              error: null,
            }),
        },
      },
    };
  },
}));
vi.mock('@domus/supabase/session', () => ({
  getSessionIdentity: () => identity(),
}));
vi.mock('@/lib/context/load', () => ({
  loadResolvedContext: (input: unknown) => loadResolvedContext(input),
}));

const { proxy } = await import('./proxy');

const ORIGIN = 'http://127.0.0.1:3000';
const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}${path}`, {
    headers: { host: '127.0.0.1:3000', ...headers },
  });
const forwarded = (response: Response, name: string) =>
  response.headers.get(`x-middleware-request-${name}`);

const PLATFORM_OPTION = { membership_id: 'platform' };
const ACTIVE = {
  active: {
    membership_id: 'm1',
    tenant_id: 'tenant-1',
    membership_role: 'guard',
  },
  options: [],
  platformMfaStep: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieWriter = undefined;
  hasFactor = false;
});

describe('proxy: route protection', () => {
  it('sends a visitor to /login with the return path', async () => {
    identity.mockResolvedValue(null);
    const response = await proxy(request('/access?x=1'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/login?next=%2Faccess%3Fx%3D1`,
    );
    expect(loadResolvedContext).not.toHaveBeenCalled();
  });

  it.each([
    '/login',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/design',
  ])('lets a visitor open the public route %s', async (path) => {
    identity.mockResolvedValue(null);
    const response = await proxy(request(path));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('keeps a signed-in user away from the login form only', async () => {
    identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal1' });
    const away = await proxy(request('/login'));
    expect(away.headers.get('location')).toBe(`${ORIGIN}/`);
    const reset = await proxy(request('/reset-password'));
    expect(reset.status).toBe(200);
  });

  it('writes refreshed session cookies and cache headers on the response', async () => {
    identity.mockImplementation(() => {
      cookieWriter?.(
        [{ name: 'sb-auth', value: 'rotated', options: { path: '/' } }],
        { 'Cache-Control': 'private, no-store' },
      );
      return Promise.resolve(null);
    });
    const response = await proxy(request('/access'));
    expect(response.cookies.get('sb-auth')?.value).toBe('rotated');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('proxy: tenant context headers', () => {
  it('sets the tenant and role from the validated context, overwriting client values', async () => {
    identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal1' });
    loadResolvedContext.mockResolvedValue(ACTIVE);
    const response = await proxy(
      request('/access', {
        cookie: 'domus-context=m1',
        'x-domus-tenant-id': 'spoofed-tenant',
        'x-domus-membership-role': 'platform_admin',
      }),
    );
    expect(forwarded(response, 'x-domus-tenant-id')).toBe('tenant-1');
    expect(forwarded(response, 'x-domus-membership-role')).toBe('guard');
    expect(loadResolvedContext).toHaveBeenCalledWith(
      expect.objectContaining({ requestedContextId: 'm1' }),
    );
  });

  it('removes spoofed headers when there is no validated context', async () => {
    identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal1' });
    loadResolvedContext.mockResolvedValue({
      active: null,
      options: [],
      platformMfaStep: null,
    });
    const response = await proxy(
      request('/access', {
        'x-domus-tenant-id': 'spoofed-tenant',
        'x-domus-membership-role': 'tenant_admin',
      }),
    );
    expect(forwarded(response, 'x-domus-tenant-id')).toBeNull();
    expect(forwarded(response, 'x-domus-membership-role')).toBeNull();
  });

  it('sets only the role for the platform context, which has no tenant', async () => {
    identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal2' });
    loadResolvedContext.mockResolvedValue({
      active: {
        membership_id: 'platform',
        tenant_id: null,
        membership_role: 'platform_admin',
      },
      options: [PLATFORM_OPTION],
      platformMfaStep: null,
    });
    const response = await proxy(request('/platform/tenants'));
    expect(forwarded(response, 'x-domus-tenant-id')).toBeNull();
    expect(forwarded(response, 'x-domus-membership-role')).toBe(
      'platform_admin',
    );
  });

  it('strips spoofed headers on public routes too', async () => {
    identity.mockResolvedValue(null);
    const response = await proxy(
      request('/design', { 'x-domus-tenant-id': 'spoofed-tenant' }),
    );
    expect(forwarded(response, 'x-domus-tenant-id')).toBeNull();
    expect(loadResolvedContext).not.toHaveBeenCalled();
  });
});

describe('proxy: second factor (M01-F05)', () => {
  const aal1 = { userId: 'u1', email: null, aal: 'aal1' };
  const aal2 = { userId: 'u1', email: null, aal: 'aal2' };

  it('sends an aal1 session with a verified factor to the challenge, keeping the return path', async () => {
    identity.mockResolvedValue(aal1);
    hasFactor = true;
    const response = await proxy(request('/access?x=1'));
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/login/mfa?next=%2Faccess%3Fx%3D1`,
    );
    expect(loadResolvedContext).not.toHaveBeenCalled();
  });

  it('lets the challenge page itself through without resolving a context', async () => {
    identity.mockResolvedValue(aal1);
    hasFactor = true;
    const response = await proxy(request('/login/mfa?next=%2F'));
    expect(response.status).toBe(200);
    expect(loadResolvedContext).not.toHaveBeenCalled();
  });

  it('does not challenge a session that is already aal2, nor a user without a factor', async () => {
    loadResolvedContext.mockResolvedValue(ACTIVE);
    identity.mockResolvedValue(aal2);
    expect((await proxy(request('/access'))).status).toBe(200);
    identity.mockResolvedValue(aal1);
    hasFactor = false;
    expect((await proxy(request('/access'))).status).toBe(200);
  });
});

describe('proxy: platform area', () => {
  const aal1 = { userId: 'u1', email: null, aal: 'aal1' };
  const aal2 = { userId: 'u1', email: null, aal: 'aal2' };

  it('sends a platform admin without a factor to enrollment, remembering where they were going', async () => {
    identity.mockResolvedValue(aal1);
    loadResolvedContext.mockResolvedValue({
      ...ACTIVE,
      platformMfaStep: 'enroll',
    });
    const response = await proxy(request('/platform/tenants'));
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/account/security?next=%2Fplatform%2Ftenants`,
    );
  });

  it('sends a platform admin with a factor but aal1 to the challenge', async () => {
    identity.mockResolvedValue(aal1);
    loadResolvedContext.mockResolvedValue({
      ...ACTIVE,
      platformMfaStep: 'challenge',
    });
    const response = await proxy(request('/platform'));
    expect(response.headers.get('location')).toBe(
      `${ORIGIN}/login/mfa?next=%2Fplatform`,
    );
  });

  it.each([
    ['an aal1 user who is not a platform admin', aal1],
    ['an aal2 user who is not a platform admin', aal2],
  ])('sends %s home', async (_label, who) => {
    identity.mockResolvedValue(who);
    loadResolvedContext.mockResolvedValue(ACTIVE);
    const response = await proxy(request('/platform/support'));
    expect(response.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  it('lets an aal2 platform admin in', async () => {
    identity.mockResolvedValue(aal2);
    loadResolvedContext.mockResolvedValue({
      active: {
        membership_id: 'platform',
        tenant_id: null,
        membership_role: 'platform_admin',
      },
      options: [PLATFORM_OPTION],
      platformMfaStep: null,
    });
    expect((await proxy(request('/platform/tenants'))).status).toBe(200);
  });

  it('does not treat lookalike paths as the platform area', async () => {
    identity.mockResolvedValue(aal1);
    loadResolvedContext.mockResolvedValue(ACTIVE);
    expect((await proxy(request('/platformer'))).status).toBe(200);
  });
});
