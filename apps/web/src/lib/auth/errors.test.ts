import { describe, expect, it } from 'vitest';
import messages from '../../../messages/es-AR.json';
import {
  AUTH_ERROR_KEYS,
  isAuthErrorKey,
  mapAuthError,
  revealsAccountExistence,
} from './errors';

describe('mapAuthError', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'invalidCredentials'],
    [{ code: 'email_not_confirmed', status: 400 }, 'emailNotConfirmed'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'rateLimit'],
    [{ code: 'over_email_send_rate_limit', status: 429 }, 'rateLimit'],
    [{ code: 'otp_expired', status: 403 }, 'expiredLink'],
    [{ code: 'flow_state_not_found', status: 404 }, 'expiredLink'],
    [{ code: 'bad_code_verifier', status: 400 }, 'expiredLink'],
    [{ code: 'session_not_found', status: 403 }, 'sessionExpired'],
    [{ code: 'weak_password', status: 422 }, 'weakPassword'],
    [{ code: 'same_password', status: 422 }, 'samePassword'],
  ] as const)('maps %j to %s', (error, key) => {
    expect(mapAuthError(error)).toBe(key);
  });

  it('recognizes network failures without a code', () => {
    expect(
      mapAuthError({ name: 'AuthRetryableFetchError', status: 0, message: '' }),
    ).toBe('network');
    expect(mapAuthError({ message: 'TypeError: fetch failed' })).toBe(
      'network',
    );
  });

  it('treats a bare 429 as a rate limit and anything else as unknown', () => {
    expect(mapAuthError({ status: 429 })).toBe('rateLimit');
    expect(mapAuthError({ code: 'something_new', status: 500 })).toBe(
      'unknown',
    );
    expect(mapAuthError(null)).toBe('unknown');
    expect(mapAuthError(undefined)).toBe('unknown');
  });

  it('never exposes the raw English message', () => {
    const key = mapAuthError({
      code: 'invalid_credentials',
      message: 'Invalid login credentials',
    });
    expect(key).not.toMatch(/invalid login/i);
  });
});

describe('error messages', () => {
  it('has an es-AR message for every error key', () => {
    expect(Object.keys(messages.auth.errors).sort()).toEqual(
      [...AUTH_ERROR_KEYS].sort(),
    );
  });

  it('recognizes only known keys', () => {
    expect(isAuthErrorKey('expiredLink')).toBe(true);
    expect(isAuthErrorKey('<script>')).toBe(false);
    expect(isAuthErrorKey(undefined)).toBe(false);
  });
});

describe('revealsAccountExistence', () => {
  it('flags errors that depend on whether the account exists', () => {
    expect(revealsAccountExistence({ code: 'user_not_found' })).toBe(true);
    expect(revealsAccountExistence({ code: 'otp_disabled' })).toBe(true);
    expect(revealsAccountExistence({ code: 'signup_disabled' })).toBe(true);
  });

  it('does not flag errors that are independent of the email', () => {
    expect(
      revealsAccountExistence({ code: 'over_email_send_rate_limit' }),
    ).toBe(false);
    expect(revealsAccountExistence({ name: 'AuthRetryableFetchError' })).toBe(
      false,
    );
    expect(revealsAccountExistence(null)).toBe(false);
  });
});
