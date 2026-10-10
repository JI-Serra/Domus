import { readSupportTokenClaims } from '@domus/domain/platform';
import type { SupportTokenClaims } from '@domus/domain/platform';

/**
 * Support (impersonation) sessions, M01-F04 / D18. While one is active the server talks to the database with the
 * *support token* instead of the platform admin's own session. The token lives in an httpOnly cookie that client
 * JavaScript can never read; only the server (`proxy.ts`, server components, server actions) uses it.
 */
export const SUPPORT_COOKIE_NAME = 'domus-support';

/** Paths that make no sense while acting as somebody else, or that could replace the admin's own session. */
const BLOCKED_PREFIXES = [
  '/account',
  '/invitations',
  '/platform',
  '/auth',
  '/design',
  '/forgot-password',
  '/reset-password',
];

/** Where blocked paths lead during a support session. */
export const SUPPORT_BLOCKED_PATH = '/support-blocked';

export function isBlockedDuringSupport(pathname: string): boolean {
  if (pathname === SUPPORT_BLOCKED_PATH) return false;
  return BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export interface SupportSession {
  /** The bearer token. Server-only: never put it in props, responses or logs. */
  token: string;
  claims: SupportTokenClaims;
}

/**
 * The live support session described by the cookie value, or null when there is none, it is malformed or its
 * expiry has passed. The signature is NOT checked here: the database re-verifies the token on every request.
 */
export function parseSupportCookie(
  value: string | undefined,
  now: Date = new Date(),
): SupportSession | null {
  if (!value) return null;
  const claims = readSupportTokenClaims(value, now);
  return claims ? { token: value, claims } : null;
}

/** Cookie attributes: httpOnly, same-site, scoped to the whole app and gone when the session would expire. */
export function supportCookieOptions(
  expiresAtSeconds: number,
  secure: boolean,
  now: Date = new Date(),
) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: Math.max(1, Math.floor(expiresAtSeconds - now.getTime() / 1000)),
  };
}
