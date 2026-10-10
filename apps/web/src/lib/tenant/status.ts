import {
  isTenantWritable,
  tenantSubscriptionStatusSchema,
} from '@domus/domain/tenant/subscription-status';
import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';
import { cache } from 'react';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

/**
 * Subscription status of a tenant, read from its `tenant` row through the *user's* RLS client (so a user can only
 * learn the status of a tenant they belong to). Fails loudly when the row is not visible: an active membership
 * guarantees it is.
 */
export async function loadTenantSubscriptionStatus(
  client: Client,
  tenantId: string,
): Promise<TenantSubscriptionStatus> {
  const { data, error } = await client
    .from('tenant')
    .select('tenant_subscription_status')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load tenant status (${error.code})`);
  if (!data) throw new Error('Could not load tenant status (not visible)');
  return tenantSubscriptionStatusSchema.parse(data.tenant_subscription_status);
}

/** Status of a tenant for the current request (memoized per request). */
export const getTenantSubscriptionStatus = cache(
  async (tenantId: string): Promise<TenantSubscriptionStatus> =>
    loadTenantSubscriptionStatus(await createRequestClient(), tenantId),
);

/**
 * Server-side twin of `useTenantWritable()`: true when write actions are enabled for the active tenant. The platform
 * context has no tenant, so no tenant subscription limits it; a request without a session is never writable.
 */
export async function getTenantWritable(): Promise<boolean> {
  const request = await getRequestContext();
  if (!request) return false;
  const tenantId = request.resolved.active?.tenant_id;
  if (!tenantId) return true;
  return isTenantWritable(await getTenantSubscriptionStatus(tenantId));
}

export class TenantReadOnlyError extends Error {
  constructor() {
    super('The tenant is read-only (suspended or cancelled)');
    this.name = 'TenantReadOnlyError';
  }
}

/** Call first in every Server Action that writes tenant data; the UI disabling the button is not the control. */
export async function assertTenantWritable(): Promise<void> {
  if (!(await getTenantWritable())) throw new TenantReadOnlyError();
}
