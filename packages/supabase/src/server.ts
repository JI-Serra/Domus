import {
  createServerClient as createSsrServerClient,
  type CookieMethodsServer,
} from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabaseEnvironment, type SupabaseEnvironment } from './env';

// Call per request with the cookie adapter supplied by the server framework.
export function createServerClient(
  cookies: CookieMethodsServer,
  environment?: SupabaseEnvironment,
): SupabaseClient<Database> {
  const env = getSupabaseEnvironment(environment);
  return createSsrServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies },
  );
}
