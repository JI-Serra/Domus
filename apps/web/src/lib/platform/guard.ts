import { PLATFORM_CONTEXT_ID } from '@domus/domain/context';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

/**
 * The request's Supabase client, but only for an active platform admin at `aal2` who is NOT inside a support
 * session; null for everybody else. Every platform Server Action starts here. It is a cheap early refusal: the
 * database independently requires `aal2` and rejects support identities for every platform operation (S8).
 */
export async function getPlatformClient(): Promise<DomusSupabaseClient | null> {
  const request = await getRequestContext();
  if (!request || request.support || request.identity.aal !== 'aal2')
    return null;
  const isPlatformAdmin = request.resolved.options.some(
    (option) => option.membership_id === PLATFORM_CONTEXT_ID,
  );
  return isPlatformAdmin ? createRequestClient() : null;
}
