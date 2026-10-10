import { CONTEXT_COOKIE_NAME } from '@domus/domain/context';
import { getSupabaseEnvironment } from '@domus/supabase/env';
import { createSupportClient } from '@domus/supabase/platform';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DEFAULT_AFTER_LOGIN_PATH } from '@/lib/auth/redirect';
import {
  MEMBERSHIP_ROLE_HEADER,
  TENANT_ID_HEADER,
} from '@/lib/context/headers';
import { loadResolvedContext } from '@/lib/context/load';
import {
  SUPPORT_BLOCKED_PATH,
  SUPPORT_COOKIE_NAME,
  isBlockedDuringSupport,
} from './session';
import type { SupportSession } from './session';

/** Routes whose purpose is to sign somebody in; a support session never needs them. */
const SIGN_IN_PATHS = new Set(['/login']);

function endedResponse(origin: string): NextResponse {
  // The support token no longer works (ended, expired or revoked): drop it and go back to the admin's own session.
  const response = NextResponse.redirect(new URL('/platform/support', origin));
  response.cookies.delete(SUPPORT_COOKIE_NAME);
  return response;
}

/**
 * The proxy while a platform admin acts as another user (M01-F04, D18). The admin's own session cookies are left
 * alone; every decision here is made as the target user, with the support token, and re-validated by the database:
 *
 * - areas that could change the account or replace the admin's session (security, invitations, sign-in, the platform
 *   area itself) are replaced by a "not available during support" page;
 * - the context is loaded with the support client, so it contains only the target's memberships in the one tenant the
 *   session is bound to; when none resolve the token is dead and the cookie is cleared.
 */
export async function handleSupportRequest({
  request,
  forwardedHeaders,
  support,
  origin,
}: {
  request: NextRequest;
  forwardedHeaders: Headers;
  support: SupportSession;
  origin: string;
}): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (SIGN_IN_PATHS.has(pathname))
    return NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN_PATH, origin));
  if (isBlockedDuringSupport(pathname))
    return NextResponse.redirect(new URL(SUPPORT_BLOCKED_PATH, origin));

  const env = getSupabaseEnvironment();
  const client = createSupportClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    support.token,
  );
  let resolved;
  try {
    resolved = await loadResolvedContext({
      client,
      identity: { userId: support.claims.sub, email: null, aal: 'aal1' },
      requestedContextId: request.cookies.get(CONTEXT_COOKIE_NAME)?.value,
      hasVerifiedFactor: false,
    });
  } catch {
    // A token the database rejects (forged, revoked key) fails loudly there; treat it as ended.
    return endedResponse(origin);
  }
  if (!resolved.active) return endedResponse(origin);

  if (resolved.active.tenant_id)
    forwardedHeaders.set(TENANT_ID_HEADER, resolved.active.tenant_id);
  forwardedHeaders.set(MEMBERSHIP_ROLE_HEADER, resolved.active.membership_role);
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader !== null) forwardedHeaders.set('cookie', cookieHeader);
  return NextResponse.next({ request: { headers: forwardedHeaders } });
}
