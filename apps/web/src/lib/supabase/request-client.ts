import { createSupportClient } from '@domus/supabase/platform';
import { getSupabaseEnvironment } from '@domus/supabase/env';
import { createServerClient } from '@domus/supabase/server';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { cookies } from 'next/headers';
import { SUPPORT_COOKIE_NAME, parseSupportCookie } from '@/lib/support/session';

/**
 * The signed-in user's own Supabase client (anon key + their session cookies), whatever else is going on. Every
 * query runs under RLS. Never use a `service_role` key in the web app.
 */
export async function createActorRequestClient(): Promise<DomusSupabaseClient> {
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

/**
 * Supabase client for the current request. Normally the signed-in user's own client; during a support session
 * (M01-F04) it is the *support* client instead: the target user's identity through the short-lived support token, so
 * the platform admin sees and does exactly what that user could, audited under the admin's name. That client has no
 * auth session of its own (`client.auth` throws), which is what keeps account changes out of reach.
 */
export async function createRequestClient(): Promise<DomusSupabaseClient> {
  const support = parseSupportCookie(
    (await cookies()).get(SUPPORT_COOKIE_NAME)?.value,
  );
  if (support) {
    const env = getSupabaseEnvironment();
    return createSupportClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      support.token,
    );
  }
  return createActorRequestClient();
}
