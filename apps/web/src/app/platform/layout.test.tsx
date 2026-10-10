// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigatesTo, notFound, redirect } from '@/test/server-mocks';

const getRequestContext = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
vi.mock('@/components/shell/server-shell', () => ({
  ServerShell: () => null,
}));

const { default: PlatformLayout } = await import('./layout');

const PLATFORM = {
  membership_id: 'platform',
  tenant_id: null,
  membership_role: 'platform_admin',
};
const TENANT = {
  membership_id: 'm1',
  tenant_id: 't1',
  membership_role: 'tenant_admin',
};
const request = (aal: 'aal1' | 'aal2', resolved: Record<string, unknown>) => ({
  identity: { userId: 'u1', email: null, aal },
  resolved: {
    active: TENANT,
    options: [TENANT],
    platformMfaStep: null,
    ...resolved,
  },
});

const render = () => PlatformLayout({ children: 'content' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('platform area guard', () => {
  it('sends a visitor to /login', async () => {
    getRequestContext.mockResolvedValue(null);
    await expect(navigatesTo(render)).resolves.toBe('/login');
  });

  it('sends a platform admin without a factor to enrollment, remembering the destination', async () => {
    getRequestContext.mockResolvedValue(
      request('aal1', { platformMfaStep: 'enroll' }),
    );
    await expect(navigatesTo(render)).resolves.toBe(
      `/account/security?next=${encodeURIComponent('/platform')}`,
    );
  });

  it('sends a platform admin with a factor but aal1 to the challenge', async () => {
    getRequestContext.mockResolvedValue(
      request('aal1', { platformMfaStep: 'challenge' }),
    );
    await expect(navigatesTo(render)).resolves.toBe(
      `/login/mfa?next=${encodeURIComponent('/platform')}`,
    );
  });

  it.each([
    ['a tenant user at aal1', 'aal1'],
    ['a tenant user at aal2 (not a platform admin)', 'aal2'],
  ] as const)(
    'answers 404 to %s, without confirming the area exists',
    async (_label, aal) => {
      getRequestContext.mockResolvedValue(request(aal, {}));
      await expect(navigatesTo(render)).resolves.toBe('not-found');
    },
  );

  it('answers 404 if the platform context ever shows up for an aal1 session', async () => {
    getRequestContext.mockResolvedValue(
      request('aal1', { active: PLATFORM, options: [PLATFORM] }),
    );
    await expect(navigatesTo(render)).resolves.toBe('not-found');
  });

  it('lets an aal2 platform admin in', async () => {
    getRequestContext.mockResolvedValue(
      request('aal2', { active: PLATFORM, options: [TENANT, PLATFORM] }),
    );
    await expect(navigatesTo(render)).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
