/** Authenticator assurance level of a session: `aal1` is a first factor only, `aal2` includes a verified TOTP code. */
export type AssuranceLevel = 'aal1' | 'aal2';

/** The MFA screen a user has to go through next: enroll a first factor, or answer the challenge of an enrolled one. */
export type MfaStep = 'enroll' | 'challenge';

export interface MfaFacts {
  aal: AssuranceLevel;
  /** True when the user has at least one verified factor. */
  hasVerifiedFactor: boolean;
}

/**
 * Step after a first-factor sign-in (M01-F05): anybody who enrolled a factor answers it before using the app, so
 * enrolling is never decorative. Returns null at `aal2` or when there is nothing to challenge.
 */
export function loginMfaStep({
  aal,
  hasVerifiedFactor,
}: MfaFacts): 'challenge' | null {
  return aal === 'aal1' && hasVerifiedFactor ? 'challenge' : null;
}

/**
 * Step a platform admin must complete before the platform area (M01-F05, S8): enroll when there is no factor,
 * challenge when there is one but the session is still `aal1`. Null for anybody else and for `aal2`. Only drives
 * navigation; the database independently requires `aal2` for every platform operation.
 */
export function platformMfaStep({
  isPlatformAdmin,
  aal,
  hasVerifiedFactor,
}: MfaFacts & { isPlatformAdmin: boolean }): MfaStep | null {
  if (!isPlatformAdmin || aal === 'aal2') return null;
  return hasVerifiedFactor ? 'challenge' : 'enroll';
}

/** Tenant admins are advised (not forced) to enroll: true when any of the user's roles is `tenant_admin`. */
export function isMfaRecommended(roles: readonly string[]): boolean {
  return roles.includes('tenant_admin');
}

/** A TOTP code as typed by the user: exactly six digits (spaces are tolerated and removed). */
export function normalizeTotpCode(raw: string): string | null {
  const digits = raw.replaceAll(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}
