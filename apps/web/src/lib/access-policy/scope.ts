import type { DomusSupabaseClient } from '@domus/supabase/types';
import { notFound } from 'next/navigation';
import { getRequestContext } from '@/lib/context/request-context';
import { getAdminPermissions } from '@/lib/registry/permissions';
import { createRequestClient } from '@/lib/supabase/request-client';
import { getTenantWritable } from '@/lib/tenant/status';

export interface PolicyScope {
  client: DomusSupabaseClient;
  tenantId: string;
  timeZone: string;
  /** Holds `access_config`: may see the metadata and the change history (a suspended barrio stays readable). */
  canConfigure: boolean;
  /** Holds `access_config` and the barrio accepts writes: the only case the interface offers editing. */
  canEdit: boolean;
}

/**
 * Scope of the active tenant administrator for the access policy. Every administrator may read the policy (the
 * database allows it to any member); only `access_config` edits it and reads its history. Anybody else gets the same
 * 404 as for an unknown page. The database repeats every check.
 */
export async function requirePolicyScope(): Promise<PolicyScope> {
  const request = await getRequestContext();
  const active = request?.resolved.active;
  if (!active?.tenant_id || active.membership_role !== 'tenant_admin')
    notFound();
  const held = await getAdminPermissions();
  const canConfigure = held.includes('access_config');
  return {
    client: await createRequestClient(),
    tenantId: active.tenant_id,
    timeZone: active.tenant_time_zone,
    canConfigure,
    canEdit: canConfigure && (await getTenantWritable()),
  };
}
