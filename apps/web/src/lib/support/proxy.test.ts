// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supportToken } from '@/test/support-token';

const loadResolvedContext = vi.fn();
const createSupportClient = vi.fn<(...args: unknown[]) => object>(() => ({
  kind: 'support-client',
}));
vi.mock('@/lib/context/load', () => ({
  loadResolvedContext: (input: unknown) => loadResolvedContext(input),
}));
vi.mock('@domus/supabase/platform', () => ({
  createSupportClient: (...args: unknown[]) => createSupportClient(...args),
}));
vi.mock('@domus/supabase/env', () => ({
  getSupabaseEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'http://api.test',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  }),
}));

const { handleSupportRequest } = await import('./proxy');
const { parseSupportCookie } = await import('./session');

const ORIGIN = 'http://127.0.0.1:3000';
const token = supportToken();
const support = parseSupportCookie(token)!;

const run = (path: string, headers = new Headers()) =>
  handleSupportRequest({
    request: new NextRequest(`${ORIGIN}${path}`, {
      headers: { cookie: `domus-support=${token}`, host: '127.0.0.1:3000' },
    }),
    forwardedHeaders: headers,
    support,
    origin: ORIGIN,
  });

const location = (response: Response) =>
  new URL(response.headers.get('location') ?? '', ORIGIN).pathname;

beforeEach(() => {
  vi.clearAllMocks();
  loadResolvedContext.mockResolvedValue({
    active: {
      membership_id: 'm1',
      tenant_id: 'tenant-1',
      membership_role: 'tenant_admin',
    },
    options: [],
    platformMfaStep: null,
  });
});

describe('handleSupportRequest', () => {
  it.each(['/account/security', '/platform/tenants', '/invitations/accept'])(
    'replaces %s with the "not available" page without touching the database',
    async (path) => {
      const response = await run(path);
      expect(location(response)).toBe('/support-blocked');
      expect(loadResolvedContext).not.toHaveBeenCalled();
    },
  );

  it('sends the sign-in page back to the app', async () => {
    expect(location(await run('/login'))).toBe('/');
  });

  it('loads the context as the target, with the support token and no second factor', async () => {
    const headers = new Headers();
    const response = await run('/registry', headers);

    expect(response.headers.get('location')).toBeNull();
    expect(createSupportClient).toHaveBeenCalledWith(
      'http://api.test',
      'anon',
      token,
    );
    expect(loadResolvedContext).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: { userId: 'target-user', email: null, aal: 'aal1' },
        hasVerifiedFactor: false,
      }),
    );
    expect(headers.get('x-domus-tenant-id')).toBe('tenant-1');
    expect(headers.get('x-domus-membership-role')).toBe('tenant_admin');
    expect(headers.get('cookie')).toContain('domus-support');
  });

  it('drops the cookie and returns to the platform when the token no longer resolves to a context', async () => {
    loadResolvedContext.mockResolvedValue({
      active: null,
      options: [],
      platformMfaStep: null,
    });
    const response = await run('/');
    expect(location(response)).toBe('/platform/support');
    expect(response.headers.get('set-cookie')).toContain('domus-support=;');
  });

  it('treats a token the database rejects the same way', async () => {
    loadResolvedContext.mockRejectedValue(new Error('JWT invalid'));
    const response = await run('/');
    expect(location(response)).toBe('/platform/support');
    expect(response.headers.get('set-cookie')).toContain('domus-support=;');
  });
});
