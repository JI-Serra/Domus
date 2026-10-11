import type { MembershipRole } from '@domus/domain/context';

/** Roles that belong to a unit: they land in "Mi hogar" after accepting an invitation. */
const RESIDENT_ROLES: readonly MembershipRole[] = [
  'unit_holder',
  'household_member',
];

export function isResidentRole(role: unknown): role is MembershipRole {
  return RESIDENT_ROLES.includes(role as MembershipRole);
}

/**
 * Where a user lands right after accepting an invitation. The role only picks between two internal pages, and
 * whatever it says the page itself re-checks the real membership, so a forged value gains nothing.
 */
export function invitationLandingPath(role: unknown): '/' | '/home' {
  return isResidentRole(role) ? '/home' : '/';
}
