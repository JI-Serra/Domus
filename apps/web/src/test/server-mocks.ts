import { vi } from 'vitest';

/** What `redirect()` and `notFound()` throw in Next; tests assert on these instead of following the navigation. */
export class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
export class NotFoundSignal extends Error {
  constructor() {
    super('NEXT_NOT_FOUND');
  }
}

export const redirect = vi.fn((url: string): never => {
  throw new RedirectSignal(url);
});
export const notFound = vi.fn((): never => {
  throw new NotFoundSignal();
});

/** Result of a call that is expected to navigate away: the target of the redirect, or 'not-found'. */
export async function navigatesTo(run: () => unknown): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    if (error instanceof NotFoundSignal) return 'not-found';
    throw error;
  }
}

type AuthResult<T = unknown> = Promise<{ data: T; error: unknown }>;

export interface FakeFactor {
  id: string;
  friendly_name: string | null;
  status: 'verified' | 'unverified';
  created_at: string;
}

/** A minimal stand-in for the auth MFA API of the request client. */
export function fakeMfaClient(initial: FakeFactor[] = []) {
  const factors = [...initial];
  const mfa = {
    listFactors: vi.fn((): AuthResult => {
      return Promise.resolve({
        data: {
          all: factors,
          totp: factors.filter((f) => f.status === 'verified'),
        },
        error: null,
      });
    }),
    challengeAndVerify: vi.fn((): AuthResult =>
      Promise.resolve({ data: {}, error: null }),
    ),
    enroll: vi.fn((): AuthResult =>
      Promise.resolve({
        data: {
          id: 'factor-new',
          totp: { qr_code: '<svg/>', secret: 'SECRET', uri: 'otpauth://x' },
        },
        error: null,
      }),
    ),
    unenroll: vi.fn((): AuthResult =>
      Promise.resolve({ data: { id: 'x' }, error: null }),
    ),
  };
  return { client: { auth: { mfa } }, mfa, factors };
}

export const verifiedFactor = (id = 'factor-1'): FakeFactor => ({
  id,
  friendly_name: `App ${id}`,
  status: 'verified',
  created_at: '2026-10-10T12:00:00Z',
});
export const unverifiedFactor = (id = 'factor-u'): FakeFactor => ({
  id,
  friendly_name: null,
  status: 'unverified',
  created_at: '2026-10-10T12:00:00Z',
});

export function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
