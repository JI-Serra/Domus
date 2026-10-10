// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeMfaClient,
  formData,
  navigatesTo,
  notFound,
  redirect,
  unverifiedFactor,
  verifiedFactor,
} from '@/test/server-mocks';

const identity = vi.fn();
let fake = fakeMfaClient();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestIdentity: () => identity(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve(fake.client),
}));

const {
  cancelTotpEnrollmentAction,
  removeFactorAction,
  startTotpEnrollmentAction,
  verifyTotpEnrollmentAction,
} = await import('./actions');
const IDLE = { status: 'idle' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal1' });
  fake = fakeMfaClient();
});

describe('startTotpEnrollmentAction', () => {
  it('needs a session', async () => {
    identity.mockResolvedValue(null);
    await expect(startTotpEnrollmentAction()).resolves.toEqual({
      ok: false,
      error: 'sessionExpired',
    });
  });

  it('drops half-finished enrollments, enrolls a TOTP factor and returns the QR as a data URI plus the key', async () => {
    fake = fakeMfaClient([unverifiedFactor('stale'), verifiedFactor('keep')]);
    const result = await startTotpEnrollmentAction();

    expect(fake.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(fake.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale' });
    expect(fake.mfa.enroll).toHaveBeenCalledWith(
      expect.objectContaining({ factorType: 'totp', issuer: 'Domus' }),
    );
    expect(result).toEqual({
      ok: true,
      factorId: 'factor-new',
      qrCode: 'data:image/svg+xml;utf-8,<svg/>',
      secret: 'SECRET',
    });
  });

  it('keeps a QR the server already returned as a data URI', async () => {
    fake.mfa.enroll.mockResolvedValue({
      data: {
        id: 'f',
        totp: {
          qr_code: 'data:image/svg+xml;utf-8,<svg/>',
          secret: 'S',
          uri: 'u',
        },
      },
      error: null,
    });
    await expect(startTotpEnrollmentAction()).resolves.toMatchObject({
      qrCode: 'data:image/svg+xml;utf-8,<svg/>',
    });
  });

  it('maps an auth failure (TOTP disabled) to a Spanish message key', async () => {
    fake.mfa.enroll.mockResolvedValue({
      data: null,
      error: { code: 'mfa_totp_enroll_not_enabled', status: 400 },
    });
    await expect(startTotpEnrollmentAction()).resolves.toEqual({
      ok: false,
      error: 'mfaUnavailable',
    });
  });

  it('reports a failure to list the existing factors', async () => {
    fake.mfa.listFactors.mockResolvedValue({
      data: null,
      error: { status: 0, name: 'AuthRetryableFetchError' },
    });
    await expect(startTotpEnrollmentAction()).resolves.toEqual({
      ok: false,
      error: 'network',
    });
  });
});

describe('cancelTotpEnrollmentAction', () => {
  it('drops an unverified factor only', async () => {
    fake = fakeMfaClient([unverifiedFactor('u'), verifiedFactor('v')]);
    await cancelTotpEnrollmentAction('u');
    await cancelTotpEnrollmentAction('v');
    expect(fake.mfa.unenroll).toHaveBeenCalledTimes(1);
    expect(fake.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'u' });
  });
});

describe('verifyTotpEnrollmentAction', () => {
  beforeEach(() => {
    fake = fakeMfaClient([unverifiedFactor('pending')]);
  });

  it('rejects a malformed code before asking the auth server', async () => {
    await expect(
      verifyTotpEnrollmentAction(
        IDLE,
        formData({ code: '12', factorId: 'pending' }),
      ),
    ).resolves.toMatchObject({ error: 'mfaCodeInvalid', field: 'code' });
    expect(fake.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('only verifies the pending enrollment of this user', async () => {
    await expect(
      verifyTotpEnrollmentAction(
        IDLE,
        formData({ code: '123456', factorId: 'other' }),
      ),
    ).resolves.toMatchObject({ error: 'mfaNoFactor' });
  });

  it('reports a wrong code on the code field', async () => {
    fake.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { code: 'mfa_verification_failed', status: 422 },
    });
    await expect(
      verifyTotpEnrollmentAction(
        IDLE,
        formData({ code: '123456', factorId: 'pending' }),
      ),
    ).resolves.toEqual({
      status: 'error',
      error: 'mfaWrongCode',
      field: 'code',
    });
  });

  it('finishes in place when there is nowhere to continue', async () => {
    await expect(
      verifyTotpEnrollmentAction(
        IDLE,
        formData({ code: '123456', factorId: 'pending' }),
      ),
    ).resolves.toEqual({ status: 'done' });
  });

  it('continues to the return path (a platform admin on the way to /platform)', async () => {
    await expect(
      navigatesTo(() =>
        verifyTotpEnrollmentAction(
          IDLE,
          formData({
            code: '123456',
            factorId: 'pending',
            next: '/platform',
          }),
        ),
      ),
    ).resolves.toBe('/platform');
  });

  it('ignores an unsafe return path', async () => {
    await expect(
      verifyTotpEnrollmentAction(
        IDLE,
        formData({
          code: '123456',
          factorId: 'pending',
          next: '//evil.example',
        }),
      ),
    ).resolves.toEqual({ status: 'done' });
  });
});

describe('removeFactorAction', () => {
  beforeEach(() => {
    fake = fakeMfaClient([verifiedFactor('mine')]);
  });

  it('removes one of the user factors', async () => {
    await expect(removeFactorAction('mine')).resolves.toEqual({ ok: true });
    expect(fake.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'mine' });
  });

  it('does not touch a factor that is not the user', async () => {
    await expect(removeFactorAction('theirs')).resolves.toEqual({
      ok: false,
      error: 'mfaNoFactor',
    });
    expect(fake.mfa.unenroll).not.toHaveBeenCalled();
  });

  it('asks for the second factor when the auth server demands aal2', async () => {
    fake.mfa.unenroll.mockResolvedValue({
      data: null,
      error: { code: 'insufficient_aal', status: 401 },
    });
    await expect(removeFactorAction('mine')).resolves.toEqual({
      ok: false,
      error: 'mfaReauthRequired',
    });
  });

  it('needs a session', async () => {
    identity.mockResolvedValue(null);
    await expect(removeFactorAction('mine')).resolves.toMatchObject({
      error: 'sessionExpired',
    });
  });
});
