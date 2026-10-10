import { CONTEXT_COOKIE_NAME } from '@domus/domain/context';
import type { ResolvedContext } from '@domus/domain/context';
import { getSessionIdentity } from '@domus/supabase/session';
import type { SessionIdentity } from '@domus/supabase/session';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { createRequestClient } from '@/lib/supabase/request-client';
import { loadResolvedContext } from './load';

/** Verified identity of the current request, or null. Memoized per request. */
export const getRequestIdentity = cache(
  async (): Promise<SessionIdentity | null> =>
    getSessionIdentity(await createRequestClient()),
);

export interface RequestContext {
  identity: SessionIdentity;
  resolved: ResolvedContext;
}

/**
 * Validated active context of the current request. The context cookie is only a *request*: it is checked against
 * the user's active memberships on every call, so a stale or forged value falls back to the default. Returns null
 * when nobody is signed in. Memoized per request.
 */
export const getRequestContext = cache(
  async (): Promise<RequestContext | null> => {
    const identity = await getRequestIdentity();
    if (!identity) return null;
    const cookieStore = await cookies();
    const resolved = await loadResolvedContext({
      client: await createRequestClient(),
      identity,
      requestedContextId: cookieStore.get(CONTEXT_COOKIE_NAME)?.value,
    });
    return { identity, resolved };
  },
);
