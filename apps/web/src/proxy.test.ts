// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.fn();
const loadResolvedContext = vi.fn();
let cookieWriter: ((items: unknown[], headers: unknown) => void) | undefined;

vi.mock('@domus/supabase/server', () => ({
  createServerClient: (adapter: { setAll: typeof cookieWriter }) => {
    cookieWriter = adapter.setAll;
    return { kind: 'client' };
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

const ACTIVE = {
  active: {
    membership_id: 'm1',
    tenant_id: 'tenant-1',
    membership_role: 'guard',
  },
  options: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  cookieWriter = undefined;
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
    loadResolvedContext.mockResolvedValue({ active: null, options: [] });
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
      options: [],
    });
    const response = await proxy(request('/tenants'));
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
