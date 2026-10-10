import { createServerClient } from '@domus/supabase/server';
import { cookies } from 'next/headers';

/**
 * Supabase client for the current request, scoped to the signed-in user (anon key + the user's own JWT, so every
 * query runs under RLS). Never use a `service_role` key in the web app.
 */
export async function createRequestClient() {
  const cookieStore = await cookies();
  return createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (items) => {
      try {
        for (const { name, value, options } of items)
          cookieStore.set(name, value, options);
      } catch {
        // Called from a Server Component, where cookies are read-only. `proxy.ts` refreshes the session instead.
      }
    },
  });
}
