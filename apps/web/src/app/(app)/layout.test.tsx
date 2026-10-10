// @vitest-environment node
import { isValidElement } from 'react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigatesTo, notFound, redirect } from '@/test/server-mocks';

const getRequestContext = vi.fn();
const getTenantSubscriptionStatus = vi.fn();
const loadCancelledTenants = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
vi.mock('@/lib/tenant/status', () => ({
  getTenantSubscriptionStatus: (id: string) => getTenantSubscriptionStatus(id),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve({}),
}));
vi.mock('@/lib/tenant/cancelled', () => ({
  loadCancelledTenants: () => loadCancelledTenants(),
}));
vi.mock('@/components/shell/cancelled-tenants', () => ({
  CancelledTenants: () => null,
}));
vi.mock('@/components/shell/server-shell', () => ({ ServerShell: () => null }));
vi.mock('@/components/shell/no-memberships', () => ({
  NoMemberships: () => null,
}));
vi.mock('@/components/tenant/tenant-cancelled', () => ({
  TenantCancelled: () => null,
}));

const { default: AppLayout } = await import('./layout');
const { ServerShell } = await import('@/components/shell/server-shell');
const { NoMemberships } = await import('@/components/shell/no-memberships');
const { CancelledTenants } =
  await import('@/components/shell/cancelled-tenants');
const { TenantCancelled } =
  await import('@/components/tenant/tenant-cancelled');

const TENANT = {
  membership_id: 'm1',
  tenant_id: 't1',
  membership_role: 'tenant_admin',
};
const PLATFORM = {
  membership_id: 'platform',
  tenant_id: null,
  membership_role: 'platform_admin',
};
const resolved = (overrides: Record<string, unknown>) => ({
  resolved: {
    active: TENANT,
    options: [TENANT],
    platformMfaStep: null,
    ...overrides,
  },
});

async function render() {
  return (await AppLayout({ children: 'page' })) as ReactElement<{
    children: unknown;
  }>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantSubscriptionStatus.mockResolvedValue('active');
  loadCancelledTenants.mockResolvedValue([]);
});

describe('tenant area layout', () => {
  it('sends a visitor to /login', async () => {
    getRequestContext.mockResolvedValue(null);
    await expect(navigatesTo(render)).resolves.toBe('/login');
  });

  it('shows the shell around the page for an active tenant', async () => {
    getRequestContext.mockResolvedValue(resolved({}));
    const tree = await render();
    expect(tree.type).toBe(ServerShell);
    expect(tree.props.children).toBe('page');
  });

  it.each(['pilot', 'suspended'])(
    'keeps the pages of a %s tenant (suspension is read-only, not a block)',
    async (status) => {
      getTenantSubscriptionStatus.mockResolvedValue(status);
      getRequestContext.mockResolvedValue(resolved({}));
      expect((await render()).props.children).toBe('page');
    },
  );

  it('replaces the page with the blocking page when the tenant is cancelled', async () => {
    getTenantSubscriptionStatus.mockResolvedValue('cancelled');
    getRequestContext.mockResolvedValue(resolved({}));
    const content = (await render()).props.children;
    expect(isValidElement(content) && content.type).toBe(TenantCancelled);
  });

  it('reads the status of the active tenant through the user client', async () => {
    getRequestContext.mockResolvedValue(resolved({}));
    await render();
    expect(getTenantSubscriptionStatus).toHaveBeenCalledWith('t1');
  });

  it('shows the empty state to a user with nothing to act as', async () => {
    getRequestContext.mockResolvedValue(
      resolved({ active: null, options: [] }),
    );
    expect((await render()).type).toBe(NoMemberships);
  });

  it('tells a user whose only barrios were cancelled, naming them', async () => {
    const cancelled = [{ tenant_id: 't9', tenant_name: 'Barrio Viejo' }];
    loadCancelledTenants.mockResolvedValue(cancelled);
    getRequestContext.mockResolvedValue(
      resolved({ active: null, options: [] }),
    );
    const tree = await render();
    expect(tree.type).toBe(CancelledTenants);
    expect((tree.props as unknown as { tenants: unknown }).tenants).toBe(
      cancelled,
    );
  });

  it('does not look for cancelled barrios when the user can act somewhere', async () => {
    getRequestContext.mockResolvedValue(resolved({}));
    await render();
    expect(loadCancelledTenants).not.toHaveBeenCalled();
  });

  it('leads a platform admin below aal2 (no memberships) to the platform area, which asks for the factor', async () => {
    getRequestContext.mockResolvedValue(
      resolved({ active: null, options: [], platformMfaStep: 'enroll' }),
    );
    await expect(navigatesTo(render)).resolves.toBe('/platform');
  });

  it('keeps the platform context out of the tenant area', async () => {
    getRequestContext.mockResolvedValue(
      resolved({ active: PLATFORM, options: [PLATFORM] }),
    );
    await expect(navigatesTo(render)).resolves.toBe('/platform');
    expect(getTenantSubscriptionStatus).not.toHaveBeenCalled();
  });
});
