// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { supportToken } from '@/test/support-token';
import {
  SUPPORT_BLOCKED_PATH,
  SUPPORT_COOKIE_NAME,
  isBlockedDuringSupport,
  parseSupportCookie,
  supportCookieOptions,
} from './session';

describe('parseSupportCookie', () => {
  it('returns the token with its claims while the session is live', () => {
    const token = supportToken();
    const session = parseSupportCookie(token);
    expect(session?.token).toBe(token);
    expect(session?.claims.sub).toBe('target-user');
    expect(session?.claims.support_tenant_id).toBe('tenant-1');
  });

  it.each([undefined, '', 'garbage', 'a.b.c'])('ignores %j', (value) => {
    expect(parseSupportCookie(value)).toBeNull();
  });

  it('ignores an expired token', () => {
    expect(parseSupportCookie(supportToken({}, -5))).toBeNull();
  });
});

describe('isBlockedDuringSupport', () => {
  it.each([
    '/account/security',
    '/account',
    '/platform',
    '/platform/tenants/abc',
    '/invitations/accept',
    '/auth/callback',
    '/design',
    '/forgot-password',
    '/reset-password',
  ])('closes %s', (path) => {
    expect(isBlockedDuringSupport(path)).toBe(true);
  });

  it.each([
    '/',
    '/registry',
    '/settings',
    '/settings/support',
    '/accounting',
    SUPPORT_BLOCKED_PATH,
  ])('leaves %s open', (path) => {
    expect(isBlockedDuringSupport(path)).toBe(false);
  });
});

describe('supportCookieOptions', () => {
  it('is httpOnly, same-site and lasts until the session expires', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const options = supportCookieOptions(
      Math.floor(now.getTime() / 1000) + 1800,
      true,
      now,
    );
    expect(options).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 1800,
    });
    expect(
      supportCookieOptions(Math.floor(now.getTime() / 1000) - 5, false, now)
        .maxAge,
    ).toBe(1);
  });

  it('has a stable cookie name', () => {
    expect(SUPPORT_COOKIE_NAME).toBe('domus-support');
  });
});
