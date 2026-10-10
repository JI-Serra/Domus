import { headers } from 'next/headers';

/**
 * Origin the browser used to reach this app, from the proxy-aware host headers. Used for links inside auth emails
 * and for redirects: `request.nextUrl` is not reliable behind `next start -H` or a reverse proxy, and a redirect to
 * another host would drop the session cookies. The auth server additionally only honors redirect URLs on its
 * allow list, and Next validates the host for Server Actions.
 */
export function siteUrlFromHeaders(requestHeaders: Headers): string {
  const host =
    requestHeaders.get('x-forwarded-host') ??
    requestHeaders.get('host') ??
    '127.0.0.1:3000';
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const protocol =
    requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    (isLocal ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export async function getSiteUrl(): Promise<string> {
  return siteUrlFromHeaders(await headers());
}
