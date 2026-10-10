import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PASSWORD } from './accounts';
import { extractAuthLink, waitForEmailText } from './mailpit';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see apps/web/.env.example)`);
  return value;
}

/** A supabase-js client with the public anon key, exactly what a browser has. */
export function anonClient(): SupabaseClient {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function signedInClient(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`Could not sign in ${email}: ${error.message}`);
  return client;
}

/**
 * Creates a fresh account with no memberships through the public sign-up endpoint, then confirms it by following
 * the real confirmation link from Mailpit (email confirmation is required, see supabase/config.toml).
 * Used for flows that change the account, so the seeded users stay untouched.
 */
export async function createDisposableUser(): Promise<{
  email: string;
  password: string;
  userId: string;
}> {
  const email = `e2e.${Date.now()}.${Math.floor(Math.random() * 1e6)}@domus.local`;
  const password = PASSWORD;
  const { data, error } = await anonClient().auth.signUp({ email, password });
  if (error || !data.user)
    throw new Error(`Could not create ${email}: ${error?.message}`);
  const confirmation = await fetch(
    extractAuthLink(await waitForEmailText(email)),
    { redirect: 'manual' },
  );
  if (confirmation.status >= 400)
    throw new Error(`Could not confirm ${email}: ${confirmation.status}`);
  return { email, password, userId: data.user.id };
}

/** The access token of the session in the browser's auth cookies (the cookies are not httpOnly by design). */
export async function accessTokenFromCookies(
  cookies: readonly { name: string; value: string }[],
): Promise<string> {
  const chunks = cookies
    .filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (chunks.length === 0) throw new Error('No Supabase auth cookie');
  const joined = chunks.map((cookie) => cookie.value).join('');
  const json = joined.startsWith('base64-')
    ? Buffer.from(joined.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(joined);
  const session = JSON.parse(json) as { access_token: string };
  return session.access_token;
}

/** A client that sends this JWT (a user's access token, or a support token) with every request. */
export function clientWithToken(token: string): SupabaseClient {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      accessToken: async () => token,
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/** Claims of a JWT (no verification: the tests only read what the server issued). */
export function jwtClaims(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Not a JWT');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}
