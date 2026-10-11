import { policyTemplates } from '@domus/domain/access-policy';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { loadAccessPolicy, loadAccessPolicyHistory } from './data';
import { accessPolicyErrorKey } from './errors';

vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));

const clientAnswering = (data: unknown, error: unknown = null) =>
  ({
    rpc: vi.fn().mockResolvedValue({ data, error }),
  }) as unknown as DomusSupabaseClient;

const metadata = {
  access_policy_id: '00000000-0000-4000-8000-000000000001',
  access_policy_applied_template: 'balanced',
  access_policy_updated_by_user_id: null,
  access_policy_updated_at: '2026-10-11T12:00:00Z',
};

describe('loadAccessPolicy', () => {
  it('returns the validated policy and the administrator metadata', async () => {
    const client = clientAnswering({
      policy: policyTemplates.balanced,
      metadata,
    });
    const loaded = await loadAccessPolicy(client, 'tenant-1');
    expect(loaded.policy).toEqual(policyTemplates.balanced);
    expect(loaded.metadata?.access_policy_applied_template).toBe('balanced');
    expect(client.rpc).toHaveBeenCalledWith('get_access_policy', {
      target_tenant_id: 'tenant-1',
    });
  });

  it('gives members the policy without metadata (what M04 consumes)', async () => {
    const loaded = await loadAccessPolicy(
      clientAnswering({ policy: policyTemplates.strict }),
      'tenant-1',
    );
    expect(loaded.metadata).toBeNull();
    expect(loaded.policy.access_policy_approval_timeout_seconds_count).toBe(
      120,
    );
  });

  it('keeps a hand-edited policy as no applied template', async () => {
    const loaded = await loadAccessPolicy(
      clientAnswering({
        policy: policyTemplates.flexible,
        metadata: { ...metadata, access_policy_applied_template: null },
      }),
      'tenant-1',
    );
    expect(loaded.metadata?.access_policy_applied_template).toBeNull();
  });

  it('refuses an answer that is not a valid policy', async () => {
    await expect(
      loadAccessPolicy(clientAnswering({ policy: { rules: {} } }), 't'),
    ).rejects.toThrow('Could not read the access policy');
    await expect(loadAccessPolicy(clientAnswering(null), 't')).rejects.toThrow(
      'Could not read the access policy',
    );
  });

  it('throws with the SQLSTATE only when the database refuses', async () => {
    await expect(
      loadAccessPolicy(
        clientAnswering(null, {
          code: '42501',
          message: 'Access policy denied',
        }),
        't',
      ),
    ).rejects.toThrow('Could not load the access policy (42501)');
  });
});

describe('loadAccessPolicyHistory', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    audit_event_id: 'event-1',
    audit_event_actor_user_id: 'user-1',
    audit_event_occurred_at: '2026-10-11T12:00:00Z',
    audit_event_on_behalf_of_user_id: null,
    support_session_id: null,
    before_policy: policyTemplates.balanced,
    after_policy: policyTemplates.strict,
    access_policy_applied_template: 'strict',
    client_event_id: 'client-1',
    ...overrides,
  });

  it('turns each snapshot pair into a diff, keeping the order it came in', async () => {
    const items = await loadAccessPolicyHistory(
      clientAnswering([
        entry(),
        entry({
          audit_event_id: 'event-2',
          before_policy: policyTemplates.strict,
          after_policy: policyTemplates.strict,
          access_policy_applied_template: null,
        }),
      ]),
      'tenant-1',
    );
    expect(items.map((item) => item.eventId)).toEqual(['event-1', 'event-2']);
    expect(items[0]?.appliedTemplate).toBe('strict');
    expect(items[0]?.changes.length).toBeGreaterThan(0);
    expect(items[1]?.appliedTemplate).toBeNull();
    expect(items[1]?.changes).toEqual([]);
  });

  it('marks support entries and caps the number of entries', async () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      entry({ audit_event_id: `event-${index}`, support_session_id: 's-1' }),
    );
    const items = await loadAccessPolicyHistory(
      clientAnswering(rows),
      'tenant-1',
      3,
    );
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.isSupport)).toBe(true);
  });

  it('shows an unreadable snapshot as an entry without value changes instead of failing the page', async () => {
    const items = await loadAccessPolicyHistory(
      clientAnswering([entry({ before_policy: { nope: true } })]),
      'tenant-1',
    );
    expect(items[0]?.changes).toEqual([]);
  });
});

describe('accessPolicyErrorKey', () => {
  it('tells a refused retry from a refused caller, and never exposes the database text', () => {
    expect(
      accessPolicyErrorKey(
        { code: '42501', message: 'Access policy retry denied' },
        'op',
      ),
    ).toBe('retryConflict');
    expect(
      accessPolicyErrorKey(
        { code: '42501', message: 'Access policy denied' },
        'op',
      ),
    ).toBe('denied');
    expect(
      accessPolicyErrorKey(
        { code: '22023', message: 'Invalid access policy' },
        'op',
      ),
    ).toBe('invalid');
    expect(accessPolicyErrorKey({ code: '40P01' }, 'op')).toBe('busy');
    expect(accessPolicyErrorKey({ code: 'XX000', message: 'boom' }, 'op')).toBe(
      'unknown',
    );
  });
});
