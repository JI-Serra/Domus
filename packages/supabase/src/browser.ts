import { createBrowserClient as createSsrBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getSupabaseEnvironment, type SupabaseEnvironment } from './env';

export function createBrowserClient(
  environment?: SupabaseEnvironment,
): SupabaseClient<Database> {
  const env = getSupabaseEnvironment(environment);
  return createSsrBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
