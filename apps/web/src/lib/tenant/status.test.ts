// @vitest-environment node
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRequestContext = vi.fn();
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
const createRequestClient = vi.fn();
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => createRequestClient(),
}));

const {
  TenantReadOnlyError,
  assertTenantWritable,
  getTenantWritable,
  loadTenantSubscriptionStatus,
} = await import('./status');

function clientReturning(result: { data: unknown; error: unknown }) {
  const calls: unknown[][] = [];
  const builder = {
    select: (...args: unknown[]) => (calls.push(['select', ...args]), builder),
    eq: (...args: unknown[]) => (calls.push(['eq', ...args]), builder),
    maybeSingle: () => Promise.resolve(result),
  };
  return {
    client: { from: (table: string) => (calls.push(['from', table]), builder) },
    calls,
  };
}

const withStatus = (status: string) =>
  clientReturning({
    data: { tenant_subscription_status: status },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadTenantSubscriptionStatus', () => {
  it('reads tenant_subscription_status of that tenant through the given (user) client', async () => {
    const { client, calls } = withStatus('suspended');
    await expect(
      loadTenantSubscriptionStatus(
        client as unknown as DomusSupabaseClient,
        't1',
      ),
    ).resolves.toBe('suspended');
    expect(calls).toContainEqual(['from', 'tenant']);
    expect(calls).toContainEqual(['select', 'tenant_subscription_status']);
    expect(calls).toContainEqual(['eq', 'tenant_id', 't1']);
  });

  it('fails loudly when the row is not visible or the query errors', async () => {
    const hidden = clientReturning({ data: null, error: null });
    await expect(
      loadTenantSubscriptionStatus(
        hidden.client as unknown as DomusSupabaseClient,
        't1',
      ),
    ).rejects.toThrow(/not visible/);
    const broken = clientReturning({ data: null, error: { code: '42501' } });
    await expect(
      loadTenantSubscriptionStatus(
        broken.client as unknown as DomusSupabaseClient,
        't1',
      ),
    ).rejects.toThrow(/42501/);
  });

  it('rejects a status the app does not know', async () => {
    const { client } = withStatus('paused');
    await expect(
      loadTenantSubscriptionStatus(
        client as unknown as DomusSupabaseClient,
        't1',
      ),
    ).rejects.toThrow();
  });
});

describe('getTenantWritable / assertTenantWritable', () => {
  const asTenant = (status: string) => {
    getRequestContext.mockResolvedValue({
      resolved: { active: { tenant_id: `tenant-${status}` } },
    });
    createRequestClient.mockResolvedValue(withStatus(status).client);
  };

  it.each([
    ['pilot', true],
    ['active', true],
    ['suspended', false],
    ['cancelled', false],
  ] as const)('%s → writable: %s', async (status, writable) => {
    asTenant(status);
    await expect(getTenantWritable()).resolves.toBe(writable);
    if (writable) await expect(assertTenantWritable()).resolves.toBeUndefined();
    else
      await expect(assertTenantWritable()).rejects.toBeInstanceOf(
        TenantReadOnlyError,
      );
  });

  it('is not limited by a tenant subscription in the platform context (no tenant)', async () => {
    getRequestContext.mockResolvedValue({
      resolved: { active: { tenant_id: null } },
    });
    await expect(getTenantWritable()).resolves.toBe(true);
  });

  it('is never writable without a session', async () => {
    getRequestContext.mockResolvedValue(null);
    await expect(getTenantWritable()).resolves.toBe(false);
  });
});
