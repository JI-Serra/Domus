import { describe, expect, it } from 'vitest';
import {
  isMfaRecommended,
  loginMfaStep,
  normalizeTotpCode,
  platformMfaStep,
} from './mfa';

describe('loginMfaStep', () => {
  it('challenges an aal1 session whose user has a verified factor', () => {
    expect(loginMfaStep({ aal: 'aal1', hasVerifiedFactor: true })).toBe(
      'challenge',
    );
  });
  it.each([
    ['aal2 with a factor', { aal: 'aal2', hasVerifiedFactor: true }],
    ['aal1 without a factor', { aal: 'aal1', hasVerifiedFactor: false }],
  ] as const)('does nothing for %s', (_label, facts) => {
    expect(loginMfaStep(facts)).toBeNull();
  });
});

describe('platformMfaStep', () => {
  it('sends a platform admin without a factor to enrollment', () => {
    expect(
      platformMfaStep({
        isPlatformAdmin: true,
        aal: 'aal1',
        hasVerifiedFactor: false,
      }),
    ).toBe('enroll');
  });
  it('sends a platform admin with a factor but aal1 to the challenge', () => {
    expect(
      platformMfaStep({
        isPlatformAdmin: true,
        aal: 'aal1',
        hasVerifiedFactor: true,
      }),
    ).toBe('challenge');
  });
  it('lets an aal2 platform admin through and ignores everybody else', () => {
    expect(
      platformMfaStep({
        isPlatformAdmin: true,
        aal: 'aal2',
        hasVerifiedFactor: true,
      }),
    ).toBeNull();
    expect(
      platformMfaStep({
        isPlatformAdmin: false,
        aal: 'aal1',
        hasVerifiedFactor: false,
      }),
    ).toBeNull();
  });
});

describe('isMfaRecommended', () => {
  it('recommends MFA to tenant admins only', () => {
    expect(isMfaRecommended(['unit_holder', 'tenant_admin'])).toBe(true);
    expect(isMfaRecommended(['guard', 'unit_holder'])).toBe(false);
    expect(isMfaRecommended([])).toBe(false);
  });
});

describe('normalizeTotpCode', () => {
  it.each([
    ['123456', '123456'],
    [' 123 456 ', '123456'],
    ['000000', '000000'],
  ])('accepts %j', (raw, expected) => {
    expect(normalizeTotpCode(raw)).toBe(expected);
  });
  it.each(['', '12345', '1234567', 'abcdef', '12 34 5a'])(
    'rejects %j',
    (raw) => {
      expect(normalizeTotpCode(raw)).toBeNull();
    },
  );
});
