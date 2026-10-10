/** Where signed-in users land when no (valid) return path was given. */
export const DEFAULT_AFTER_LOGIN_PATH = '/';

/** Backslashes (browsers treat `/\` like `//`) and control characters (header and URL smuggling). */
function hasForbiddenCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code === 0x5c || code <= 0x1f || code === 0x7f;
  });
}

/**
 * Returns `candidate` only when it is a same-origin relative path (`/x?y=z`); otherwise the fallback. Blocks open
 * redirects such as `//evil.com`, `/\evil.com`, `https://evil.com` and `javascript:` URLs.
 */
export function safeNextPath(
  candidate: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN_PATH,
): string {
  if (typeof candidate !== 'string') return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (hasForbiddenCharacter(candidate)) return fallback;
  try {
    // A relative path must stay on the same origin once resolved.
    const base = 'http://domus.invalid';
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/** `/login` URL that sends the user back to `returnPath` after signing in. */
export function loginUrlFor(returnPath: string): string {
  const next = safeNextPath(returnPath);
  return next === DEFAULT_AFTER_LOGIN_PATH
    ? '/login'
    : `/login?next=${encodeURIComponent(next)}`;
}

/** Routes that need no session. Everything else is protected by default (see `proxy.ts`). */
const PUBLIC_EXACT = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/debug/error',
]);
const PUBLIC_SECTIONS = ['/auth', '/design'];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_SECTIONS.some(
    (section) => pathname === section || pathname.startsWith(`${section}/`),
  );
}
