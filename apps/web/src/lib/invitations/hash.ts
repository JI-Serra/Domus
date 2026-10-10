export interface HashSession {
  accessToken: string;
  refreshToken: string;
}

export type HashResult =
  | { kind: 'none' }
  | { kind: 'session'; session: HashSession }
  | { kind: 'error' };

/**
 * What the auth server left in the URL fragment after the visitor followed the email link: the new session
 * (`#access_token=…&refresh_token=…`) or an error (`#error=access_denied&error_code=otp_expired…`). Fragments never
 * reach the server, so only the browser can read this; it hands the tokens to a Server Action that stores the
 * session in cookies and the fragment is dropped by the redirect.
 */
export function parseAuthHash(hash: string): HashResult {
  const params = new URLSearchParams(
    hash.startsWith('#') ? hash.slice(1) : hash,
  );
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken)
    return { kind: 'session', session: { accessToken, refreshToken } };
  if (
    params.get('error') ||
    params.get('error_code') ||
    params.get('error_description')
  )
    return { kind: 'error' };
  return { kind: 'none' };
}
