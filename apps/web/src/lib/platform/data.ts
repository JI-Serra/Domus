import type { Database } from '@domus/supabase/database.types';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

type Tables = Database['public']['Tables'];

export type TenantRow = Pick<
  Tables['tenant']['Row'],
  | 'tenant_id'
  | 'tenant_name'
  | 'tenant_slug'
  | 'tenant_address'
  | 'tenant_time_zone'
  | 'tenant_subscription_status'
  | 'tenant_logo_path'
  | 'tenant_billable_unit_statuses'
  | 'tenant_created_at'
>;

export type InvitationRow = Pick<
  Tables['invitation']['Row'],
  | 'invitation_id'
  | 'invitation_email'
  | 'invitation_first_name'
  | 'invitation_last_name'
  | 'invitation_membership_role'
  | 'invitation_status'
  | 'invitation_expires_at'
  | 'invitation_created_at'
>;

export type SupportSessionRow = Pick<
  Tables['support_session']['Row'],
  | 'support_session_id'
  | 'tenant_id'
  | 'support_session_actor_user_id'
  | 'support_session_target_user_id'
  | 'support_session_reason'
  | 'support_session_started_at'
  | 'support_session_expires_at'
  | 'support_session_ended_at'
  | 'support_session_status'
>;

const TENANT_COLUMNS =
  'tenant_id, tenant_name, tenant_slug, tenant_address, tenant_time_zone, tenant_subscription_status, tenant_logo_path, tenant_billable_unit_statuses, tenant_created_at';

/** Keeps letters, digits, spaces and hyphens: the search text goes into a PostgREST filter, not a SQL string. */
export function sanitizeSearch(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

export async function listTenants(
  client: Client,
  search = '',
  limit = 200,
): Promise<TenantRow[]> {
  const term = sanitizeSearch(search);
  let query = client
    .from('tenant')
    .select(TENANT_COLUMNS)
    .order('tenant_name', { ascending: true })
    .limit(limit);
  if (term)
    query = query.or(`tenant_name.ilike.%${term}%,tenant_slug.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load tenants (${error.code})`);
  return data;
}

export async function getTenant(
  client: Client,
  tenantId: string,
): Promise<TenantRow | null> {
  const { data, error } = await client
    .from('tenant')
    .select(TENANT_COLUMNS)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load the tenant (${error.code})`);
  return data;
}

export async function listInvitations(
  client: Client,
  tenantId: string,
): Promise<InvitationRow[]> {
  const { data, error } = await client
    .from('invitation')
    .select(
      'invitation_id, invitation_email, invitation_first_name, invitation_last_name, invitation_membership_role, invitation_status, invitation_expires_at, invitation_created_at',
    )
    .eq('tenant_id', tenantId)
    .order('invitation_created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load invitations (${error.code})`);
  return data;
}

const SUPPORT_SESSION_COLUMNS =
  'support_session_id, tenant_id, support_session_actor_user_id, support_session_target_user_id, support_session_reason, support_session_started_at, support_session_expires_at, support_session_ended_at, support_session_status';

/** Support sessions, newest first. `tenantId` narrows to one barrio (the audit view of its administrators). */
export async function listSupportSessions(
  client: Client,
  options: { tenantId?: string; limit?: number } = {},
): Promise<SupportSessionRow[]> {
  let query = client
    .from('support_session')
    .select(SUPPORT_SESSION_COLUMNS)
    .order('support_session_started_at', { ascending: false })
    .limit(options.limit ?? 50);
  if (options.tenantId) query = query.eq('tenant_id', options.tenantId);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load support sessions (${error.code})`);
  return data;
}

/** Private logo of a barrio as a short-lived signed URL, or null when it has none or cannot be signed. */
export async function signedLogoUrl(
  client: Client,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await client.storage
    .from('tenant-logo')
    .createSignedUrl(path, 60 * 60);
  return error ? null : data.signedUrl;
}
