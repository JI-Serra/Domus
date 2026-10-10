'use server';

import { CONTEXT_COOKIE_NAME } from '@domus/domain/context';
import { isInvitationToken } from '@domus/domain/platform';
import { acceptInvitation } from '@domus/supabase/platform';
import { reportError } from '@domus/observability';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { mapAuthError } from '@/lib/auth/errors';
import { loginUrlFor } from '@/lib/auth/redirect';
import { getSiteUrl } from '@/lib/auth/site-url';
import { invitationLandingPath } from '@/lib/invitations/landing';
import { readText, validateNewPassword } from '@/lib/auth/validation';
import { getRequestIdentity } from '@/lib/context/request-context';
import {
  createActorRequestClient,
  createRequestClient,
} from '@/lib/supabase/request-client';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const MAX_TOKEN_LENGTH = 4096;

const acceptPath = (token: string) =>
  `/invitations/accept?token=${encodeURIComponent(token)}`;

export type InvitationActionState =
  | { status: 'idle' }
  | {
      status: 'error';
      /** Key under `invitations.accept.errors` or `auth.errors`. */
      error: string;
      scope: 'invitation' | 'auth';
      field: 'password' | 'confirmPassword' | 'form';
    };

const fail = (
  error: string,
  scope: 'invitation' | 'auth' = 'invitation',
  field: 'password' | 'confirmPassword' | 'form' = 'form',
): InvitationActionState => ({ status: 'error', error, scope, field });

/**
 * Turns the session the email link left in the URL fragment into the session cookies. The browser reads the
 * fragment (the server never sees it) and posts it here; the tokens are validated by the auth server, and the
 * redirect to the same page drops the fragment. Anything wrong is the same "expired link" outcome.
 */
export async function establishInvitationSessionAction(
  accessToken: string,
  refreshToken: string,
  token: string,
): Promise<{ ok: false }> {
  if (
    !isInvitationToken(token) ||
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    !accessToken ||
    !refreshToken ||
    accessToken.length > MAX_TOKEN_LENGTH ||
    refreshToken.length > MAX_TOKEN_LENGTH
  )
    return { ok: false };
  const client = await createActorRequestClient();
  const { error } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return { ok: false };
  redirect(acceptPath(token));
}

/**
 * Accepts the invitation as the signed-in user. A password may be set first (an invitee created by the invite email
 * has none). Every failure of the acceptance itself is the same uniform "unavailable" answer.
 */
export async function acceptInvitationAction(
  _previous: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const token = readText(formData, 'token');
  if (!isInvitationToken(token)) return fail('unavailable');
  if (!(await getRequestIdentity())) return fail('sessionExpired');

  const password = readText(formData, 'password');
  const confirmation = readText(formData, 'confirmPassword');
  const client = await createRequestClient();
  if (password || confirmation) {
    const invalid = validateNewPassword(password, confirmation);
    if (invalid)
      return fail(
        invalid,
        'auth',
        invalid === 'passwordMismatch' ? 'confirmPassword' : 'password',
      );
    const { error } = await client.auth.updateUser({ password });
    if (error)
      return fail(
        mapAuthError(error),
        'auth',
        mapAuthError(error) === 'sessionExpired' ? 'form' : 'password',
      );
  }

  const { data: membershipId, error } = await acceptInvitation(client, token);
  if (error || !membershipId) {
    if (error?.code !== '42501')
      reportError(
        new Error(`Invitation acceptance failed (${error?.code ?? 'no id'})`),
        {
          operation: 'invitation.accept',
        },
      );
    return fail(error?.code === '42501' ? 'unavailable' : 'unknown');
  }

  // Land in the new context: the cookie is only a request, the server re-validates it against the memberships.
  (await cookies()).set(CONTEXT_COOKIE_NAME, membershipId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (await getSiteUrl()).startsWith('https://'),
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  // Residents land in their unit; everybody else in the barrio's home.
  redirect(invitationLandingPath(readText(formData, 'role')));
}

/** "Ingresar con otra cuenta": ends this device's session and returns to sign-in, then back to the invitation. */
export async function switchAccountAction(formData: FormData): Promise<void> {
  const token = readText(formData, 'token');
  const client = await createActorRequestClient();
  await client.auth.signOut({ scope: 'local' });
  (await cookies()).delete(CONTEXT_COOKIE_NAME);
  redirect(
    isInvitationToken(token) ? loginUrlFor(acceptPath(token)) : '/login',
  );
}
