import {
  CONTEXT_COOKIE_NAME,
  PLATFORM_CONTEXT_ID,
} from '@domus/domain/context';
import { createServerClient } from '@domus/supabase/server';
import { getSessionIdentity } from '@domus/supabase/session';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  DEFAULT_AFTER_LOGIN_PATH,
  isPublicPath,
  loginUrlFor,
} from '@/lib/auth/redirect';
import {
  MEMBERSHIP_ROLE_HEADER,
  TENANT_ID_HEADER,
} from '@/lib/context/headers';
import {
  MFA_CHALLENGE_PATH,
  challengeUrlFor,
  enrollmentUrlFor,
  needsChallenge,
  sessionHasVerifiedFactor,
} from '@/lib/auth/mfa';
import { siteUrlFromHeaders } from '@/lib/auth/site-url';
import { loadResolvedContext } from '@/lib/context/load';

interface PendingCookie {
  name: string;
  value: string;
  options: Parameters<NextResponse['cookies']['set']>[2];
}

/** Routes an authenticated user has no reason to open (they would just see a login form). */
const SIGNED_OUT_ONLY_PATHS = new Set(['/login']);

const isPlatformPath = (pathname: string) =>
  pathname === '/platform' || pathname.startsWith('/platform/');

/**
 * Runs before every page and Server Action (static assets excluded by the matcher):
 * 1. refreshes the Supabase session, writing the rotated cookies on the response;
 * 2. protects everything except the public routes (default deny) and sends visitors to `/login` with a return
 *    path;
 * 3. sends a user who has a second factor but a first-factor session to the MFA challenge (M01-F05), and keeps
 *    everything under `/platform` for platform admins at `aal2` (others are sent to enroll, to the challenge or away);
 * 4. sets the tenant/role request headers from the context re-validated against the user's active memberships.
 *
 * Authorization still happens in the database (RLS) and again in each layout and Server Action: this file is a
 * convenience layer, not the only gate.
 */
export async function proxy(request: NextRequest) {
  // Never let a client choose the tenant context reported with its requests.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete(TENANT_ID_HEADER);
  forwardedHeaders.delete(MEMBERSHIP_ROLE_HEADER);

  const pendingCookies: PendingCookie[] = [];
  let cacheHeaders: Record<string, string> = {};
  const supabase = createServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (items, headers) => {
      for (const { name, value, options } of items) {
        request.cookies.set(name, value);
        pendingCookies.push({ name, value, options });
      }
      cacheHeaders = { ...cacheHeaders, ...headers };
    },
  });

  const finish = (response: NextResponse) => {
    for (const { name, value, options } of pendingCookies)
      response.cookies.set(name, value, options);
    for (const [key, value] of Object.entries(cacheHeaders))
      response.headers.set(key, value);
    return response;
  };

  const { pathname, search } = request.nextUrl;
  const origin = siteUrlFromHeaders(request.headers);
  const identity = await getSessionIdentity(supabase);
  const isPublic = isPublicPath(pathname);

  if (!identity && !isPublic)
    return finish(
      NextResponse.redirect(
        new URL(loginUrlFor(`${pathname}${search}`), origin),
      ),
    );

  if (identity && SIGNED_OUT_ONLY_PATHS.has(pathname))
    return finish(
      NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN_PATH, origin)),
    );

  if (identity && !isPublic) {
    const returnPath = `${pathname}${search}`;
    const onChallengePage = pathname === MFA_CHALLENGE_PATH;
    const hasVerifiedFactor =
      identity.aal === 'aal1'
        ? await sessionHasVerifiedFactor(supabase)
        : false;

    if (!onChallengePage && needsChallenge(identity.aal, hasVerifiedFactor))
      return finish(
        NextResponse.redirect(new URL(challengeUrlFor(returnPath), origin)),
      );

    // The challenge page needs no tenant context; it only needs the session.
    if (!onChallengePage) {
      const { active, options, platformMfaStep } = await loadResolvedContext({
        client: supabase,
        identity,
        requestedContextId: request.cookies.get(CONTEXT_COOKIE_NAME)?.value,
        hasVerifiedFactor,
      });

      if (isPlatformPath(pathname)) {
        if (platformMfaStep === 'challenge')
          return finish(
            NextResponse.redirect(new URL(challengeUrlFor(returnPath), origin)),
          );
        if (platformMfaStep === 'enroll')
          return finish(
            NextResponse.redirect(
              new URL(enrollmentUrlFor(returnPath), origin),
            ),
          );
        if (
          !options.some(
            (option) => option.membership_id === PLATFORM_CONTEXT_ID,
          )
        )
          return finish(
            NextResponse.redirect(new URL(DEFAULT_AFTER_LOGIN_PATH, origin)),
          );
      }

      if (active?.tenant_id)
        forwardedHeaders.set(TENANT_ID_HEADER, active.tenant_id);
      if (active)
        forwardedHeaders.set(MEMBERSHIP_ROLE_HEADER, active.membership_role);
    }
  }

  // `forwardedHeaders` was copied before `setAll` ran; carry any refreshed session cookies to the render too.
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader !== null) forwardedHeaders.set('cookie', cookieHeader);
  return finish(NextResponse.next({ request: { headers: forwardedHeaders } }));
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
