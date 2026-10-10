import { CONTEXT_COOKIE_NAME } from '@domus/domain/context';
import type { ResolvedContext } from '@domus/domain/context';
import { getSessionIdentity } from '@domus/supabase/session';
import type { SessionIdentity } from '@domus/supabase/session';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { createRequestClient } from '@/lib/supabase/request-client';
import { SUPPORT_COOKIE_NAME, parseSupportCookie } from '@/lib/support/session';
import type { SupportSession } from '@/lib/support/session';
import { loadResolvedContext } from './load';

/**
 * The live support (impersonation) session of this request, or null. Memoized per request. Everything the server
 * renders during a support session is done as the *target* user, so callers use this to know that is the case.
 */
export const getSupportSession = cache(
  async (): Promise<SupportSession | null> =>
    parseSupportCookie((await cookies()).get(SUPPORT_COOKIE_NAME)?.value),
);

/**
 * Verified identity of the current request, or null. During a support session it is the target user at `aal1` (what
 * the support token carries); the token itself is verified by the database on every query.
 */
export const getRequestIdentity = cache(
  async (): Promise<SessionIdentity | null> => {
    const support = await getSupportSession();
    if (support)
      return { userId: support.claims.sub, email: null, aal: 'aal1' };
    return getSessionIdentity(await createRequestClient());
  },
);

export interface RequestContext {
  identity: SessionIdentity;
  resolved: ResolvedContext;
  /** Set while a platform admin is acting as the identity above. */
  support: SupportSession | null;
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
    const support = await getSupportSession();
    const cookieStore = await cookies();
    const resolved = await loadResolvedContext({
      client: await createRequestClient(),
      identity,
      requestedContextId: cookieStore.get(CONTEXT_COOKIE_NAME)?.value,
      // A support identity has no auth session to ask (and no second factor: it is never a platform admin).
      ...(support ? { hasVerifiedFactor: false } : {}),
    });
    return { identity, resolved, support };
  },
);
