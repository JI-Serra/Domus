/** Keys under `auth.errors` in `messages/es-AR.json`. Server code returns keys; components translate them. */
export const AUTH_ERROR_KEYS = [
  'invalidCredentials',
  'emailNotConfirmed',
  'rateLimit',
  'expiredLink',
  'network',
  'weakPassword',
  'samePassword',
  'sessionExpired',
  'emailRequired',
  'emailInvalid',
  'passwordRequired',
  'passwordTooShort',
  'passwordMismatch',
  'unknown',
] as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[number];

export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return (
    typeof value === 'string' &&
    (AUTH_ERROR_KEYS as readonly string[]).includes(value)
  );
}

/** The subset of a Supabase `AuthError` the mapping needs. */
export interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
  name?: string | undefined;
  message?: string | undefined;
}

const BY_CODE: Record<string, AuthErrorKey> = {
  invalid_credentials: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  over_request_rate_limit: 'rateLimit',
  over_email_send_rate_limit: 'rateLimit',
  over_sms_send_rate_limit: 'rateLimit',
  otp_expired: 'expiredLink',
  flow_state_expired: 'expiredLink',
  flow_state_not_found: 'expiredLink',
  bad_code_verifier: 'expiredLink',
  bad_jwt: 'sessionExpired',
  session_expired: 'sessionExpired',
  session_not_found: 'sessionExpired',
  refresh_token_not_found: 'sessionExpired',
  user_not_found: 'sessionExpired',
  weak_password: 'weakPassword',
  same_password: 'samePassword',
};

/**
 * Maps a Supabase Auth error to an es-AR message key. Never forwards the raw English `message` to the user.
 * Network failures (no response from the auth server) are told apart from rejections.
 */
export function mapAuthError(
  error: AuthErrorLike | null | undefined,
): AuthErrorKey {
  if (!error) return 'unknown';
  const byCode = error.code ? BY_CODE[error.code] : undefined;
  if (byCode) return byCode;
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    /fetch failed|network/i.test(error.message ?? '')
  )
    return 'network';
  if (error.status === 429) return 'rateLimit';
  return 'unknown';
}

/**
 * Error codes that would reveal whether an email has an account. Recovery and magic-link requests treat them as
 * success so the response never depends on the email existing.
 */
const ENUMERATION_ERROR_CODES: readonly string[] = [
  'user_not_found',
  'otp_disabled',
  'signup_disabled',
  'email_address_invalid',
  'email_address_not_authorized',
  'validation_failed',
];

export function revealsAccountExistence(
  error: AuthErrorLike | null | undefined,
): boolean {
  return Boolean(error?.code && ENUMERATION_ERROR_CODES.includes(error.code));
}
