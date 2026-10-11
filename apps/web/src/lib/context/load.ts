import { platformMfaStep } from '@domus/domain/auth';
import type { MfaStep } from '@domus/domain/auth';
import { resolveActiveContext } from '@domus/domain/context';
import type { MembershipRecord, ResolvedContext } from '@domus/domain/context';
import type { SessionIdentity } from '@domus/supabase/session';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';
import { sessionHasVerifiedFactor } from '@/lib/auth/mfa';

interface MembershipRow {
  membership_id: string;
  membership_role: MembershipRecord['membership_role'];
  membership_status: MembershipRecord['membership_status'];
  membership_valid_from: string;
  membership_valid_to: string | null;
  unit_id: string | null;
  unit: { unit_code: string } | null;
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
      `membership_id, membership_role, membership_status, membership_valid_from, membership_valid_to, unit_id,
       unit(unit_code),
       tenant!inner(tenant_id, tenant_name, tenant_time_zone),
       person!inner(user_id)`,
    )
    .eq('person.user_id', identity.userId)
    .eq('membership_status', 'active')
    .lte('membership_valid_from', instant)
    .or(`membership_valid_to.is.null,membership_valid_to.gt.${instant}`)
    .returns<MembershipRow[]>();
  if (error) throw new Error(`Could not load memberships (${error.code})`);
  return data.map(({ tenant, unit, ...membership }) => ({
    ...membership,
    ...tenant,
    unit_code: unit?.unit_code ?? null,
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

/**
 * True when the signed-in user is an active platform admin, whatever the session's assurance level. The
 * `platform_admin` table itself is only readable at `aal2`, so this uses the database function that reveals just the
 * caller's own status. It decides *navigation* (send them to enroll or answer the challenge) and never grants access:
 * everything in the platform area still requires `aal2` and `isPlatformAdminAal2`.
 */
export async function isPlatformAdminAnyLevel(
  client: Client,
): Promise<boolean> {
  const { data, error } = await client.rpc('current_user_is_platform_admin');
  if (error) throw new Error(`Could not load platform role (${error.code})`);
  return data === true;
}

export interface PlatformAccess {
  /** True for an active platform admin at `aal2`. */
  aal2: boolean;
  /** The MFA step still pending for a platform admin below `aal2`; null otherwise. */
  mfaStep: MfaStep | null;
}

/** Platform access of the signed-in user: granted at `aal2`, otherwise the MFA step that would unlock it. */
export async function loadPlatformAccess(
  client: Client,
  identity: Pick<SessionIdentity, 'userId' | 'aal'>,
  hasVerifiedFactor?: boolean,
): Promise<PlatformAccess> {
  if (identity.aal === 'aal2')
    return { aal2: await isPlatformAdminAal2(client, identity), mfaStep: null };
  if (!(await isPlatformAdminAnyLevel(client)))
    return { aal2: false, mfaStep: null };
  return {
    aal2: false,
    mfaStep: platformMfaStep({
      isPlatformAdmin: true,
      aal: identity.aal,
      hasVerifiedFactor:
        hasVerifiedFactor ?? (await sessionHasVerifiedFactor(client)),
    }),
  };
}

export interface LoadContextInput {
  client: Client;
  identity: SessionIdentity;
  /** Untrusted value of the context cookie. */
  requestedContextId: string | undefined;
  /** Already known by the caller (the proxy reads it once per request); looked up when missing. */
  hasVerifiedFactor?: boolean;
  now?: Date;
}

/** Loads the user's memberships and validates the requested context against them. */
export async function loadResolvedContext({
  client,
  identity,
  requestedContextId,
  hasVerifiedFactor,
  now = new Date(),
}: LoadContextInput): Promise<ResolvedContext> {
  const [memberships, platform] = await Promise.all([
    loadMemberships(client, identity, now),
    loadPlatformAccess(client, identity, hasVerifiedFactor),
  ]);
  return resolveActiveContext({
    memberships,
    requestedContextId,
    platformAdminAal2: platform.aal2,
    platformMfaStep: platform.mfaStep,
    now,
  });
}
