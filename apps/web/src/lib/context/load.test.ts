import { describe, expect, it } from 'vitest';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import {
  isPlatformAdminAal2,
  isPlatformAdminAnyLevel,
  loadMemberships,
  loadPlatformAccess,
  loadResolvedContext,
} from './load';

type Call = [method: string, ...args: unknown[]];
type Result = { data: unknown; error: unknown };

/** Minimal chainable stand-in for the PostgREST query builder: records calls, resolves to the table's result. */
function fakeClient(
  results: Record<string, Result>,
  options: { platformAdmin?: Result; hasFactor?: boolean } = {},
) {
  const calls: Record<string, Call[]> = {};
  const client = {
    rpc: (name: string) => {
      (calls.rpc ??= []).push([name]);
      return Promise.resolve(
        options.platformAdmin ?? { data: false, error: null },
      );
    },
    auth: {
      mfa: {
        listFactors: () =>
          Promise.resolve({
            data: { totp: options.hasFactor ? [{ id: 'f1' }] : [] },
            error: null,
          }),
      },
    },
    from(table: string) {
      const recorded: Call[] = (calls[table] = []);
      const builder: Record<string, unknown> = {};
      const result = results[table] ?? { data: null, error: null };
      for (const method of [
        'select',
        'eq',
        'lte',
        'or',
        'returns',
        'maybeSingle',
      ]) {
        builder[method] = (...args: unknown[]) => {
          recorded.push([method, ...args]);
          return ['returns', 'maybeSingle'].includes(method)
            ? Promise.resolve(result)
            : builder;
        };
      }
      return builder;
    },
  };
  return { client: client as unknown as DomusSupabaseClient, calls };
}

const NOW = new Date('2026-10-09T15:00:00Z');
const row = (overrides: Record<string, unknown> = {}) => ({
  membership_id: 'm1',
  membership_role: 'unit_holder',
  membership_status: 'active',
  membership_valid_from: '2026-01-01T00:00:00+00:00',
  membership_valid_to: null,
  tenant: {
    tenant_id: 't1',
    tenant_name: 'Barrio Los Ceibos',
    tenant_time_zone: 'America/Argentina/Tucuman',
  },
  ...overrides,
});

describe('loadMemberships', () => {
  it("pins the query to the verified user's own person row and the current instant", async () => {
    const { client, calls } = fakeClient({
      membership: { data: [row()], error: null },
    });
    const memberships = await loadMemberships(client, { userId: 'u1' }, NOW);

    expect(memberships).toEqual([
      {
        membership_id: 'm1',
        membership_role: 'unit_holder',
        membership_status: 'active',
        membership_valid_from: '2026-01-01T00:00:00+00:00',
        membership_valid_to: null,
        tenant_id: 't1',
        tenant_name: 'Barrio Los Ceibos',
        tenant_time_zone: 'America/Argentina/Tucuman',
      },
    ]);
    const recorded = calls.membership ?? [];
    expect(recorded).toContainEqual(['eq', 'person.user_id', 'u1']);
    expect(recorded).toContainEqual(['eq', 'membership_status', 'active']);
    expect(recorded).toContainEqual([
      'lte',
      'membership_valid_from',
      '2026-10-09T15:00:00.000Z',
    ]);
    expect(recorded).toContainEqual([
      'or',
      'membership_valid_to.is.null,membership_valid_to.gt.2026-10-09T15:00:00.000Z',
    ]);
  });

  it('fails loudly instead of showing an empty state when the query errors', async () => {
    const { client } = fakeClient({
      membership: { data: null, error: { code: '42501' } },
    });
    await expect(
      loadMemberships(client, { userId: 'u1' }, NOW),
    ).rejects.toThrow(/Could not load memberships \(42501\)/);
  });
});

describe('isPlatformAdminAal2', () => {
  it('is false at aal1 without querying', async () => {
    const { client, calls } = fakeClient({});
    await expect(
      isPlatformAdminAal2(client, { userId: 'u1', aal: 'aal1' }),
    ).resolves.toBe(false);
    expect(calls.platform_admin).toBeUndefined();
  });

  it('is true at aal2 only when an active platform_admin row is visible', async () => {
    const yes = fakeClient({
      platform_admin: { data: { platform_admin_id: 'p1' }, error: null },
    });
    await expect(
      isPlatformAdminAal2(yes.client, { userId: 'u1', aal: 'aal2' }),
    ).resolves.toBe(true);
    const no = fakeClient({ platform_admin: { data: null, error: null } });
    await expect(
      isPlatformAdminAal2(no.client, { userId: 'u1', aal: 'aal2' }),
    ).resolves.toBe(false);
  });

  it('propagates query errors', async () => {
    const { client } = fakeClient({
      platform_admin: { data: null, error: { code: 'PGRST301' } },
    });
    await expect(
      isPlatformAdminAal2(client, { userId: 'u1', aal: 'aal2' }),
    ).rejects.toThrow(/PGRST301/);
  });
});

describe('loadResolvedContext', () => {
  const identity = { userId: 'u1', email: null, aal: 'aal1' } as const;

  it('validates the requested context against the loaded memberships', async () => {
    const { client } = fakeClient({
      membership: {
        data: [
          row(),
          row({
            membership_id: 'm2',
            tenant: {
              tenant_id: 't2',
              tenant_name: 'Barrio Las Tipas',
              tenant_time_zone: 'America/Argentina/Tucuman',
            },
          }),
        ],
        error: null,
      },
    });
    const forged = await loadResolvedContext({
      client,
      identity,
      requestedContextId: 'not-mine',
      now: NOW,
    });
    expect(forged.active?.membership_id).toBe('m2');
    const chosen = await loadResolvedContext({
      client,
      identity,
      requestedContextId: 'm1',
      now: NOW,
    });
    expect(chosen.active?.membership_id).toBe('m1');
  });

  it('drops memberships the database should not have returned (expired)', async () => {
    const { client } = fakeClient({
      membership: {
        data: [row({ membership_valid_to: '2026-10-01T00:00:00Z' })],
        error: null,
      },
    });
    const result = await loadResolvedContext({
      client,
      identity,
      requestedContextId: 'm1',
      now: NOW,
    });
    expect(result).toEqual({
      active: null,
      options: [],
      platformMfaStep: null,
    });
  });

  it('offers the platform context to an aal2 platform admin', async () => {
    const { client } = fakeClient({
      membership: { data: [], error: null },
      platform_admin: { data: { platform_admin_id: 'p1' }, error: null },
    });
    const result = await loadResolvedContext({
      client,
      identity: { userId: 'u1', email: null, aal: 'aal2' },
      requestedContextId: undefined,
      now: NOW,
    });
    expect(result.active?.membership_role).toBe('platform_admin');
  });
});

describe('isPlatformAdminAnyLevel', () => {
  it('asks the database function that reveals only the own status of the caller', async () => {
    const yes = fakeClient({}, { platformAdmin: { data: true, error: null } });
    await expect(isPlatformAdminAnyLevel(yes.client)).resolves.toBe(true);
    expect(yes.calls.rpc).toEqual([['current_user_is_platform_admin']]);
    const no = fakeClient({}, { platformAdmin: { data: false, error: null } });
    await expect(isPlatformAdminAnyLevel(no.client)).resolves.toBe(false);
  });

  it('propagates errors instead of guessing', async () => {
    const { client } = fakeClient(
      {},
      { platformAdmin: { data: null, error: { code: '42883' } } },
    );
    await expect(isPlatformAdminAnyLevel(client)).rejects.toThrow(/42883/);
  });
});

describe('loadPlatformAccess', () => {
  const aal1 = { userId: 'u1', aal: 'aal1' } as const;

  it('grants nothing and asks nothing of a user who is not a platform admin', async () => {
    const { client } = fakeClient({});
    await expect(loadPlatformAccess(client, aal1)).resolves.toEqual({
      aal2: false,
      mfaStep: null,
    });
  });

  it('sends an aal1 platform admin without a factor to enrollment', async () => {
    const { client } = fakeClient(
      {},
      { platformAdmin: { data: true, error: null }, hasFactor: false },
    );
    await expect(loadPlatformAccess(client, aal1)).resolves.toEqual({
      aal2: false,
      mfaStep: 'enroll',
    });
  });

  it('sends an aal1 platform admin with a factor to the challenge (reading the factor only when unknown)', async () => {
    const { client } = fakeClient(
      {},
      { platformAdmin: { data: true, error: null }, hasFactor: true },
    );
    await expect(loadPlatformAccess(client, aal1)).resolves.toEqual({
      aal2: false,
      mfaStep: 'challenge',
    });
    const known = fakeClient(
      {},
      { platformAdmin: { data: true, error: null }, hasFactor: false },
    );
    await expect(
      loadPlatformAccess(known.client, aal1, true),
    ).resolves.toMatchObject({ mfaStep: 'challenge' });
  });

  it('grants access at aal2 through the RLS-protected row', async () => {
    const { client, calls } = fakeClient({
      platform_admin: { data: { platform_admin_id: 'p1' }, error: null },
    });
    await expect(
      loadPlatformAccess(client, { userId: 'u1', aal: 'aal2' }),
    ).resolves.toEqual({ aal2: true, mfaStep: null });
    expect(calls.rpc).toBeUndefined();
  });
});

describe('loadResolvedContext at aal1', () => {
  it('reports the pending MFA step of a platform admin instead of hiding the platform option', async () => {
    const { client } = fakeClient(
      { membership: { data: [row()], error: null } },
      { platformAdmin: { data: true, error: null }, hasFactor: false },
    );
    const result = await loadResolvedContext({
      client,
      identity: { userId: 'u1', email: null, aal: 'aal1' },
      requestedContextId: undefined,
      now: NOW,
    });
    expect(result.platformMfaStep).toBe('enroll');
    expect(result.active?.membership_id).toBe('m1');
  });
});
