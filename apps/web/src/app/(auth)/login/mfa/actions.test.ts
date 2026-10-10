// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeMfaClient,
  formData,
  navigatesTo,
  notFound,
  redirect,
  verifiedFactor,
} from '@/test/server-mocks';

const identity = vi.fn();
let fake = fakeMfaClient();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestIdentity: () => identity(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve(fake.client),
}));

const { verifyMfaChallengeAction } = await import('./actions');
const IDLE = { status: 'idle' } as const;

beforeEach(() => {
  vi.clearAllMocks();
  identity.mockResolvedValue({ userId: 'u1', email: null, aal: 'aal1' });
  fake = fakeMfaClient([
    verifiedFactor('factor-1'),
    verifiedFactor('factor-2'),
  ]);
});

describe('verifyMfaChallengeAction', () => {
  it('needs a session', async () => {
    identity.mockResolvedValue(null);
    await expect(
      verifyMfaChallengeAction(IDLE, formData({ code: '123456' })),
    ).resolves.toMatchObject({ status: 'error', error: 'sessionExpired' });
    expect(fake.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it.each(['', '12345', 'abcdef', '1234567'])(
    'rejects the malformed code %j without asking the auth server',
    async (code) => {
      await expect(
        verifyMfaChallengeAction(
          IDLE,
          formData({ code, factorId: 'factor-1' }),
        ),
      ).resolves.toEqual({
        status: 'error',
        error: 'mfaCodeInvalid',
        field: 'code',
      });
      expect(fake.mfa.challengeAndVerify).not.toHaveBeenCalled();
    },
  );

  it('only answers factors that belong to the user', async () => {
    await expect(
      verifyMfaChallengeAction(
        IDLE,
        formData({ code: '123456', factorId: 'somebody-elses' }),
      ),
    ).resolves.toMatchObject({ status: 'error', error: 'mfaNoFactor' });
    expect(fake.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('reports a wrong code on the code field', async () => {
    fake.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { code: 'mfa_verification_failed', status: 422 },
    });
    await expect(
      verifyMfaChallengeAction(
        IDLE,
        formData({ code: '000000', factorId: 'factor-1' }),
      ),
    ).resolves.toEqual({
      status: 'error',
      error: 'mfaWrongCode',
      field: 'code',
    });
  });

  it('reports other failures on the form', async () => {
    fake.mfa.challengeAndVerify.mockResolvedValue({
      data: null,
      error: { code: 'over_request_rate_limit', status: 429 },
    });
    await expect(
      verifyMfaChallengeAction(
        IDLE,
        formData({ code: '000000', factorId: 'factor-1' }),
      ),
    ).resolves.toMatchObject({ error: 'rateLimit', field: 'form' });
  });

  it('answers the chosen factor and continues to a safe return path', async () => {
    const target = await navigatesTo(() =>
      verifyMfaChallengeAction(
        IDLE,
        formData({
          code: '123 456',
          factorId: 'factor-2',
          next: '/platform/tenants',
        }),
      ),
    );
    expect(target).toBe('/platform/tenants');
    expect(fake.mfa.challengeAndVerify).toHaveBeenCalledWith({
      factorId: 'factor-2',
      code: '123456',
    });
  });

  it('never redirects to another origin', async () => {
    const target = await navigatesTo(() =>
      verifyMfaChallengeAction(
        IDLE,
        formData({
          code: '123456',
          factorId: 'factor-1',
          next: 'https://evil.example/phish',
        }),
      ),
    );
    expect(target).toBe('/');
  });
});
