import type { EmailOtpType } from '@domus/supabase/types';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { mapAuthError } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/redirect';
import { siteUrlFromHeaders } from '@/lib/auth/site-url';
import { createRequestClient } from '@/lib/supabase/request-client';

const EMAIL_OTP_TYPES: readonly string[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function failure(request: NextRequest, error: string) {
  const target = new URL('/login', siteUrlFromHeaders(request.headers));
  target.searchParams.set('error', error);
  return NextResponse.redirect(target);
}

/**
 * Landing point of the links in auth emails (magic link and password recovery).
 * - `?code=` is the PKCE flow: the code is exchanged for a session using the verifier cookie set when the email was
 *   requested, so the link only works in the browser that asked for it.
 * - `?token_hash=&type=` is the OTP flow for cross-device links.
 * The session lands in cookies and the visitor goes to `next` (a same-origin path only).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get('next'));

  // The auth server reports expired or reused links as `error`/`error_code` parameters.
  if (searchParams.get('error') || searchParams.get('error_code'))
    return failure(
      request,
      mapAuthError({ code: searchParams.get('error_code') ?? undefined }),
    );

  const client = await createRequestClient();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return failure(request, 'expiredLink');
    return NextResponse.redirect(
      new URL(next, siteUrlFromHeaders(request.headers)),
    );
  }

  if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) return failure(request, 'expiredLink');
    return NextResponse.redirect(
      new URL(next, siteUrlFromHeaders(request.headers)),
    );
  }

  return failure(request, 'expiredLink');
}
