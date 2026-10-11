import { unitSheet } from '@domus/supabase/registry';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';
import { getTenantWritable } from '@/lib/tenant/status';
import type { HouseholdSheet } from './view';

export interface HouseholdScope {
  client: DomusSupabaseClient;
  tenantId: string;
  unitId: string;
  membershipId: string;
  isHolder: boolean;
}

/**
 * The unit the signed-in resident acts in, taken from the *server-validated* active context (never from the
 * request body): only a holder or a household member, and only with a unit. Everything else gets null.
 */
export async function getHouseholdScope(): Promise<HouseholdScope | null> {
  const request = await getRequestContext();
  const active = request?.resolved.active;
  if (
    !active ||
    !active.tenant_id ||
    !active.unit_id ||
    (active.membership_role !== 'unit_holder' &&
      active.membership_role !== 'household_member')
  )
    return null;
  return {
    client: await createRequestClient(),
    tenantId: active.tenant_id,
    unitId: active.unit_id,
    membershipId: active.membership_id,
    isHolder: active.membership_role === 'unit_holder',
  };
}

export type ManagerScope =
  | { scope: HouseholdScope; problem: null }
  | { scope: null; problem: 'denied' | 'readOnly' };

/**
 * Scope for an action that changes the household: a holder, in a barrio that accepts writes. The database decides
 * again (`require_unit_manager`); this is the early, uniform refusal.
 */
export async function getManagerScope(): Promise<ManagerScope> {
  const scope = await getHouseholdScope();
  if (!scope?.isHolder) return { scope: null, problem: 'denied' };
  if (!(await getTenantWritable())) return { scope: null, problem: 'readOnly' };
  return { scope, problem: null };
}

/** The unit sheet of the scope, or null when the database refuses it. */
export async function loadHouseholdSheet(
  scope: Pick<HouseholdScope, 'client' | 'tenantId' | 'unitId'>,
): Promise<HouseholdSheet | null> {
  const { data, error } = await unitSheet(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
  });
  return error || !data ? null : (data as HouseholdSheet);
}
