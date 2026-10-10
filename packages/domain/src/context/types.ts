/** Role values from GLOSSARY.md (`membership_role`) that live on a `membership` row. */
export const TENANT_MEMBERSHIP_ROLES = [
  'tenant_admin',
  'guard',
  'unit_holder',
  'household_member',
] as const;

export type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number];

/** A tenant role, or the platform operator role (which is not a membership; see `platform_admin`). */
export type MembershipRole = TenantMembershipRole | 'platform_admin';

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'revoked'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** Identifier of the platform context. It is not a database id: platform admins have no membership row. */
export const PLATFORM_CONTEXT_ID = 'platform';

/** Name of the cookie that remembers the chosen context. Its value is only ever a *request*, never trusted. */
export const CONTEXT_COOKIE_NAME = 'domus-context';

/**
 * What the shell needs to know about the context the user is acting in: tenant + role + unit (spec §6.1). Field
 * names follow the DB naming rules so it is built straight from `membership` rows joined with `tenant`.
 */
export interface ActiveContext {
  /** `membership.membership_id`, or {@link PLATFORM_CONTEXT_ID} for the platform context. */
  membership_id: string;
  /** Null only in the platform context. */
  tenant_id: string | null;
  /** Null only in the platform context. */
  tenant_name: string | null;
  /** IANA time zone of the tenant, passed to `@domus/domain/format`. */
  tenant_time_zone: string;
  membership_role: MembershipRole;
  /** Always null until units exist (M02). Roles that are not tied to a unit keep it null afterwards too. */
  unit_id: string | null;
  unit_name: string | null;
}

/** A membership joined with its tenant, as loaded through the user's own RLS-scoped client. */
export interface MembershipRecord {
  membership_id: string;
  membership_role: TenantMembershipRole;
  membership_status: MembershipStatus;
  membership_valid_from: string;
  /** Null means open ended. */
  membership_valid_to: string | null;
  tenant_id: string;
  tenant_name: string;
  tenant_time_zone: string;
}
