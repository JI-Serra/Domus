import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

/** Who is signed in, as established by verifying the access token (never by trusting the cookie contents). */
export interface SessionIdentity {
  /** `auth.users.id`; the value `auth.uid()` returns inside the database. */
  userId: string;
  email: string | null;
  aal: AuthenticatorAssuranceLevel;
}

/**
 * Verifies the session and returns the signed-in identity, or null when there is none. Uses `getClaims()`
 * (signature verified; refreshes an expired token through the client's cookie adapter), never `getSession()`,
 * whose user object comes straight from an untrusted cookie on the server.
 */
export async function getSessionIdentity(
  client: Pick<SupabaseClient, 'auth'>,
): Promise<SessionIdentity | null> {
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== 'string' || !claims.sub)
    return null;
  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    aal: claims.aal === 'aal2' ? 'aal2' : 'aal1',
  };
}
