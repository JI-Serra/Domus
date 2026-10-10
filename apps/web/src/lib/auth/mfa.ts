import { loginMfaStep } from '@domus/domain/auth';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

/** The path where a signed-in user answers the second factor. */
export const MFA_CHALLENGE_PATH = '/login/mfa';
/** Where a user enrolls, lists and removes factors. */
export const MFA_SETTINGS_PATH = '/account/security';

/** A verified TOTP factor, reduced to what the UI shows. */
export interface VerifiedFactor {
  id: string;
  name: string;
  createdAt: string;
}

/**
 * The user's verified TOTP factors, read from the auth server (not from the cookie). Unverified ones (an enrollment
 * that was never completed) are not factors yet and are left out.
 */
export async function loadVerifiedFactors(
  client: Client,
): Promise<VerifiedFactor[]> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new Error(`Could not list MFA factors (${error.code})`);
  return data.totp.map((factor) => ({
    id: factor.id,
    name: factor.friendly_name ?? '',
    createdAt: factor.created_at,
  }));
}

/**
 * "Does this user have a verified second factor?", for routing a first-factor session (challenge page, platform
 * area). It asks the auth server (`GET /user`): the cookie-stored session does not carry the user's factors, so the
 * client-side assurance levels cannot tell. Only used to *route*; authorization never depends on it, because the
 * database checks the `aal` claim of the JWT itself.
 */
export async function sessionHasVerifiedFactor(
  client: Pick<Client, 'auth'>,
): Promise<boolean> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw new Error(`Could not list MFA factors (${error.code})`);
  return data.totp.length > 0;
}

/** True when this aal1 session must go through the challenge before anything else (see `loginMfaStep`). */
export function needsChallenge(
  aal: 'aal1' | 'aal2',
  hasVerifiedFactor: boolean,
): boolean {
  return loginMfaStep({ aal, hasVerifiedFactor }) === 'challenge';
}

/** `/login/mfa` with a return path (`next` is validated again where it is read). */
export function challengeUrlFor(next: string): string {
  return `${MFA_CHALLENGE_PATH}?next=${encodeURIComponent(next)}`;
}

/** `/account/security` for a platform admin who has to enroll before continuing to `next`. */
export function enrollmentUrlFor(next: string): string {
  return `${MFA_SETTINGS_PATH}?next=${encodeURIComponent(next)}`;
}
