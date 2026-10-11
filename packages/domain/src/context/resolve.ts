import type { MfaStep } from '../auth/mfa';
import { DEFAULT_TENANT_TIME_ZONE } from '../format';
import { PLATFORM_CONTEXT_ID, TENANT_MEMBERSHIP_ROLES } from './types';
import type { ActiveContext, MembershipRecord } from './types';

export interface ResolveActiveContextInput {
  /** Memberships the database returned for the signed-in user. They are re-checked here (defense in depth). */
  memberships: readonly MembershipRecord[];
  /**
   * The context the user asked for (e.g. the value of the context cookie). It is untrusted: it only selects among
   * the options computed from `memberships`, so a stale or forged value falls back to the default.
   */
  requestedContextId?: string | null | undefined;
  /** True only for an active platform admin whose session is `aal2`. Offers the platform context. */
  platformAdminAal2?: boolean;
  /**
   * For a platform admin whose session is below `aal2`: the MFA step that unlocks the platform context (see
   * `platformMfaStep`). The platform option is then *offered as that step* instead of being hidden silently. Ignored
   * when `platformAdminAal2` is true.
   */
  platformMfaStep?: MfaStep | null;
  /** Instant used to evaluate validity windows. Defaults to the current time. */
  now?: Date;
}

export interface ResolvedContext {
  /** The validated active context, or null when the user has nothing to act as. */
  active: ActiveContext | null;
  /** Every context the user may switch to, in a stable order (default first). Contains `active` when it is not null. */
  options: readonly ActiveContext[];
  /** The step the platform option stands for when it is locked behind MFA; null when it is offered, or not at all. */
  platformMfaStep: MfaStep | null;
}

const ROLE_ORDER = new Map<string, number>(
  TENANT_MEMBERSHIP_ROLES.map((role, index) => [role, index]),
);

/** A membership grants access only while `active` and inside its validity window `[from, to)`. */
export function isMembershipCurrentlyActive(
  membership: MembershipRecord,
  now: Date,
): boolean {
  if (membership.membership_status !== 'active') return false;
  const from = Date.parse(membership.membership_valid_from);
  if (Number.isNaN(from) || from > now.getTime()) return false;
  if (membership.membership_valid_to === null) return true;
  const to = Date.parse(membership.membership_valid_to);
  return !Number.isNaN(to) && now.getTime() < to;
}

function compareMemberships(a: MembershipRecord, b: MembershipRecord): number {
  return (
    a.tenant_name.localeCompare(b.tenant_name, 'es-AR', {
      sensitivity: 'base',
    }) ||
    (ROLE_ORDER.get(a.membership_role) ?? 99) -
      (ROLE_ORDER.get(b.membership_role) ?? 99) ||
    a.membership_id.localeCompare(b.membership_id)
  );
}

function toContext(membership: MembershipRecord): ActiveContext {
  return {
    membership_id: membership.membership_id,
    tenant_id: membership.tenant_id,
    tenant_name: membership.tenant_name,
    tenant_time_zone: membership.tenant_time_zone,
    membership_role: membership.membership_role,
    unit_id: membership.unit_id ?? null,
    unit_name: membership.unit_code ?? null,
  };
}

export function platformContext(): ActiveContext {
  return {
    membership_id: PLATFORM_CONTEXT_ID,
    tenant_id: null,
    tenant_name: null,
    tenant_time_zone: DEFAULT_TENANT_TIME_ZONE,
    membership_role: 'platform_admin',
    unit_id: null,
    unit_name: null,
  };
}

/**
 * Resolves the active context from the user's memberships and an untrusted request.
 *
 * - Only currently active memberships become options (status and validity window re-checked here).
 * - The default is the first option by tenant name (then role, then id), so the result is deterministic.
 * - The platform option is appended last, and only when `platformAdminAal2` is true. Below `aal2` it is reported as
 *   `platformMfaStep` (the challenge or enrollment to complete) so the UI can offer it instead of hiding it.
 * - `requestedContextId` is honored only when it matches an option; anything else gives the default.
 */
export function resolveActiveContext({
  memberships,
  requestedContextId,
  platformAdminAal2 = false,
  platformMfaStep = null,
  now = new Date(),
}: ResolveActiveContextInput): ResolvedContext {
  const seen = new Set<string>();
  const options: ActiveContext[] = memberships
    .filter((membership) => isMembershipCurrentlyActive(membership, now))
    .filter((membership) => {
      if (seen.has(membership.membership_id)) return false;
      seen.add(membership.membership_id);
      return true;
    })
    .sort(compareMemberships)
    .map(toContext);
  if (platformAdminAal2) options.push(platformContext());

  const requested = options.find(
    (option) => option.membership_id === requestedContextId,
  );
  const active = requested ?? options[0] ?? null;
  return {
    active,
    options,
    platformMfaStep: platformAdminAal2 ? null : platformMfaStep,
  };
}
