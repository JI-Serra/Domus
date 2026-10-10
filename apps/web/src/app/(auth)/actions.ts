'use server';

import { redirect } from 'next/navigation';
import { mapAuthError, revealsAccountExistence } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/redirect';
import { getSiteUrl } from '@/lib/auth/site-url';
import type { AuthFormState } from '@/lib/auth/state';
import {
  normalizeEmail,
  readText,
  validateEmail,
  validateNewPassword,
} from '@/lib/auth/validation';
import { getRequestIdentity } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

// Every action returns keys of `auth.errors`; the form translates them. Raw auth-server messages never reach the UI.

/** Email + password sign-in. On success redirects to the return path. */
export async function signInWithPasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(readText(formData, 'email'));
  const password = readText(formData, 'password');
  const emailError = validateEmail(email);
  if (emailError)
    return { status: 'error', error: emailError, field: 'email', email };
  if (!password)
    return {
      status: 'error',
      error: 'passwordRequired',
      field: 'password',
      email,
    };

  const client = await createRequestClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    return {
      status: 'error',
      error: mapAuthError(error),
      field: 'form',
      email,
    };
  redirect(safeNextPath(readText(formData, 'next')));
}

/**
 * Magic link (email OTP). The answer is the same whether or not the email has an account, so the form cannot be
 * used to discover who is registered. Sign-ups through this form are disabled.
 */
export async function requestMagicLinkAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(readText(formData, 'email'));
  const emailError = validateEmail(email);
  if (emailError)
    return { status: 'error', error: emailError, field: 'email', email };

  const next = safeNextPath(readText(formData, 'next'));
  const client = await createRequestClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error && !revealsAccountExistence(error))
    return {
      status: 'error',
      error: mapAuthError(error),
      field: 'form',
      email,
    };
  return { status: 'sent', email };
}

/** Password recovery request. Always answers "sent" unless the failure does not depend on the email. */
export async function requestPasswordResetAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = normalizeEmail(readText(formData, 'email'));
  const emailError = validateEmail(email);
  if (emailError)
    return { status: 'error', error: emailError, field: 'email', email };

  const client = await createRequestClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  });
  if (error && !revealsAccountExistence(error))
    return {
      status: 'error',
      error: mapAuthError(error),
      field: 'form',
      email,
    };
  return { status: 'sent', email };
}

/** Sets a new password for the user in the current (recovery) session. */
export async function updatePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = readText(formData, 'password');
  const confirmation = readText(formData, 'confirmPassword');
  const invalid = validateNewPassword(password, confirmation);
  if (invalid)
    return {
      status: 'error',
      error: invalid,
      field: invalid === 'passwordMismatch' ? 'confirmPassword' : 'password',
      email: '',
    };

  if (!(await getRequestIdentity()))
    return {
      status: 'error',
      error: 'sessionExpired',
      field: 'form',
      email: '',
    };

  const client = await createRequestClient();
  const { error } = await client.auth.updateUser({ password });
  if (error)
    return {
      status: 'error',
      error: mapAuthError(error),
      field: mapAuthError(error) === 'sessionExpired' ? 'form' : 'password',
      email: '',
    };
  redirect('/');
}
