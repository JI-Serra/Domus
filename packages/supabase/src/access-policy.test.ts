import { describe, expect, it, vi } from 'vitest';
import type { DomusSupabaseClient } from './types';
import {
  accessPolicyHistory,
  applyAccessPolicyTemplate,
  getAccessPolicy,
  updateAccessPolicy,
} from './access-policy';

describe('access policy RPC clients', () => {
  it('preserves named arguments, caller event IDs and RPC results', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { rpc } as unknown as DomusSupabaseClient;
    const tenant = { target_tenant_id: 'tenant' };
    await getAccessPolicy(client, tenant);
    await accessPolicyHistory(client, tenant);
    const template = {
      ...tenant,
      template: 'strict' as const,
      client_event_id: 'event',
    };
    await applyAccessPolicyTemplate(client, template);
    const update = { ...tenant, policy: {}, client_event_id: 'event' };
    expect(await updateAccessPolicy(client, update)).toEqual({
      data: {},
      error: null,
    });
    expect(rpc.mock.calls).toEqual([
      ['get_access_policy', tenant],
      ['access_policy_history', tenant],
      ['apply_access_policy_template', template],
      ['update_access_policy', update],
    ]);
  });
});
