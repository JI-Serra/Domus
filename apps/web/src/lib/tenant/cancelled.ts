import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

export interface CancelledTenant {
  tenant_id: string;
  tenant_name: string;
}

/**
 * The barrios where the signed-in user has an active membership but whose subscription was cancelled. Cancelled
 * barrios are invisible to RLS (access is closed), so the database exposes just this list — id and name of the
 * caller's OWN memberships — through `current_user_cancelled_tenants()`. Empty for a support identity.
 */
export async function loadCancelledTenants(
  client: Client,
): Promise<CancelledTenant[]> {
  const { data, error } = await client.rpc('current_user_cancelled_tenants');
  if (error)
    throw new Error(`Could not load cancelled tenants (${error.code})`);
  return data;
}
