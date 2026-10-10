import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PASSWORD } from './accounts';

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
 * Creates a fresh account with no memberships through the public sign-up endpoint (local confirmations are off).
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
  return { email, password, userId: data.user.id };
}
