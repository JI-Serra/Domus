import { resolveActiveContext } from '@domus/domain/context';
import type { MembershipRecord, ResolvedContext } from '@domus/domain/context';
import type { SessionIdentity } from '@domus/supabase/session';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

interface MembershipRow {
  membership_id: string;
  membership_role: MembershipRecord['membership_role'];
  membership_status: MembershipRecord['membership_status'];
  membership_valid_from: string;
  membership_valid_to: string | null;
  tenant: {
    tenant_id: string;
    tenant_name: string;
    tenant_time_zone: string;
  };
}

/**
 * The signed-in user's currently active memberships with their tenant, through the user's own RLS-scoped client.
 *
 * Several tenant admins can read *other people's* memberships in their tenant, so the query is pinned to the
 * person row bound to this user (`person.user_id`), and `userId` comes from the verified session, never from the
 * request. The window and status are filtered in the database; the resolver checks them again.
 */
export async function loadMemberships(
  client: Client,
  identity: Pick<SessionIdentity, 'userId'>,
  now: Date,
): Promise<MembershipRecord[]> {
  const instant = now.toISOString();
  const { data, error } = await client
    .from('membership')
    .select(
      `membership_id, membership_role, membership_status, membership_valid_from, membership_valid_to,
       tenant!inner(tenant_id, tenant_name, tenant_time_zone),
       person!inner(user_id)`,
    )
    .eq('person.user_id', identity.userId)
    .eq('membership_status', 'active')
    .lte('membership_valid_from', instant)
    .or(`membership_valid_to.is.null,membership_valid_to.gt.${instant}`)
    .returns<MembershipRow[]>();
  if (error) throw new Error(`Could not load memberships (${error.code})`);
  return data.map(({ tenant, ...membership }) => ({
    ...membership,
    ...tenant,
  }));
}

/**
 * True for an active platform admin at `aal2`. RLS already hides `platform_admin` rows from anyone else, and the
 * assurance level is checked here as well.
 */
export async function isPlatformAdminAal2(
  client: Client,
  identity: Pick<SessionIdentity, 'userId' | 'aal'>,
): Promise<boolean> {
  if (identity.aal !== 'aal2') return false;
  const { data, error } = await client
    .from('platform_admin')
    .select('platform_admin_id')
    .eq('user_id', identity.userId)
    .eq('platform_admin_is_active', true)
    .maybeSingle();
  if (error) throw new Error(`Could not load platform role (${error.code})`);
  return data !== null;
}

export interface LoadContextInput {
  client: Client;
  identity: SessionIdentity;
  /** Untrusted value of the context cookie. */
  requestedContextId: string | undefined;
  now?: Date;
}

/** Loads the user's memberships and validates the requested context against them. */
export async function loadResolvedContext({
  client,
  identity,
  requestedContextId,
  now = new Date(),
}: LoadContextInput): Promise<ResolvedContext> {
  const [memberships, platformAdminAal2] = await Promise.all([
    loadMemberships(client, identity, now),
    isPlatformAdminAal2(client, identity),
  ]);
  return resolveActiveContext({
    memberships,
    requestedContextId,
    platformAdminAal2,
    now,
  });
}
