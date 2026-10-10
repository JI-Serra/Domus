// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData, navigatesTo, redirect } from '@/test/server-mocks';

const identity = vi.fn();
const acceptInvitation = vi.fn();
const setSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const cookieSets: { name: string; value: string }[] = [];
const cookieDeletes: string[] = [];
const client = {
  auth: {
    setSession: (...args: unknown[]) => setSession(...args),
    updateUser: (...args: unknown[]) => updateUser(...args),
    signOut: (...args: unknown[]) => signOut(...args),
  },
};

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      set: (name: string, value: string) => cookieSets.push({ name, value }),
      delete: (name: string) => cookieDeletes.push(name),
    }),
  headers: () => Promise.resolve(new Headers({ host: '127.0.0.1:3000' })),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@domus/supabase/platform', () => ({
  acceptInvitation: (...args: unknown[]) => acceptInvitation(...args),
}));
vi.mock('@/lib/context/request-context', () => ({
  getRequestIdentity: () => identity(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => Promise.resolve(client),
  createActorRequestClient: () => Promise.resolve(client),
}));

const {
  acceptInvitationAction,
  establishInvitationSessionAction,
  switchAccountAction,
} = await import('./actions');

const IDLE = { status: 'idle' } as const;
const TOKEN = 'a'.repeat(64);
const MEMBERSHIP = '40000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  cookieSets.length = 0;
  cookieDeletes.length = 0;
  identity.mockResolvedValue({ userId: 'u', email: null, aal: 'aal1' });
  acceptInvitation.mockResolvedValue({ data: MEMBERSHIP, error: null });
  setSession.mockResolvedValue({ error: null });
  updateUser.mockResolvedValue({ error: null });
});

describe('establishInvitationSessionAction', () => {
  it('stores the session the email link carried and returns to the page without the fragment', async () => {
    await expect(
      navigatesTo(() =>
        establishInvitationSessionAction('access', 'refresh', TOKEN),
      ),
    ).resolves.toBe(`/invitations/accept?token=${TOKEN}`);
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
    });
  });

  it.each([
    ['a malformed invitation token', 'access', 'refresh', 'nope'],
    ['missing tokens', '', '', TOKEN],
    ['oversized tokens', 'x'.repeat(5000), 'refresh', TOKEN],
  ])(
    'rejects %s without calling the auth server',
    async (_name, access, refresh, token) => {
      await expect(
        establishInvitationSessionAction(access, refresh, token),
      ).resolves.toEqual({ ok: false });
      expect(setSession).not.toHaveBeenCalled();
    },
  );

  it('reports a session the auth server refuses', async () => {
    setSession.mockResolvedValue({ error: { code: 'bad_jwt' } });
    await expect(
      establishInvitationSessionAction('a', 'r', TOKEN),
    ).resolves.toEqual({ ok: false });
  });
});

describe('acceptInvitationAction', () => {
  it('accepts as the signed-in user and lands in the new context', async () => {
    await expect(
      navigatesTo(() =>
        acceptInvitationAction(IDLE, formData({ token: TOKEN })),
      ),
    ).resolves.toBe('/');
    expect(acceptInvitation).toHaveBeenCalledWith(client, TOKEN);
    expect(cookieSets).toContainEqual({
      name: 'domus-context',
      value: MEMBERSHIP,
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('sets the password first when one was typed', async () => {
    await navigatesTo(() =>
      acceptInvitationAction(
        IDLE,
        formData({
          token: TOKEN,
          password: 'ClaveSegura123!',
          confirmPassword: 'ClaveSegura123!',
        }),
      ),
    );
    expect(updateUser).toHaveBeenCalledWith({ password: 'ClaveSegura123!' });
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(
      acceptInvitation.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('validates the password without accepting yet', async () => {
    expect(
      await acceptInvitationAction(
        IDLE,
        formData({ token: TOKEN, password: 'corta', confirmPassword: 'corta' }),
      ),
    ).toEqual({
      status: 'error',
      error: 'passwordTooShort',
      scope: 'auth',
      field: 'password',
    });
    expect(
      await acceptInvitationAction(
        IDLE,
        formData({
          token: TOKEN,
          password: 'ClaveSegura123!',
          confirmPassword: 'otra',
        }),
      ),
    ).toMatchObject({ error: 'passwordMismatch', field: 'confirmPassword' });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('keeps the invitation unaccepted when the password is refused', async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password' } });
    expect(
      await acceptInvitationAction(
        IDLE,
        formData({
          token: TOKEN,
          password: 'password1',
          confirmPassword: 'password1',
        }),
      ),
    ).toMatchObject({
      error: 'weakPassword',
      scope: 'auth',
      field: 'password',
    });
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it('answers every unusable invitation with the same uniform error', async () => {
    acceptInvitation.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    const uniform = {
      status: 'error',
      error: 'unavailable',
      scope: 'invitation',
      field: 'form',
    };
    expect(
      await acceptInvitationAction(IDLE, formData({ token: TOKEN })),
    ).toEqual(uniform);
    expect(
      await acceptInvitationAction(IDLE, formData({ token: 'nope' })),
    ).toEqual(uniform);
    expect(cookieSets).toHaveLength(0);
  });

  it('needs a session and reports other failures generically', async () => {
    identity.mockResolvedValue(null);
    expect(
      await acceptInvitationAction(IDLE, formData({ token: TOKEN })),
    ).toMatchObject({ error: 'sessionExpired' });
    identity.mockResolvedValue({ userId: 'u', email: null, aal: 'aal1' });
    acceptInvitation.mockResolvedValue({
      data: null,
      error: { code: 'XX000' },
    });
    expect(
      await acceptInvitationAction(IDLE, formData({ token: TOKEN })),
    ).toMatchObject({ error: 'unknown' });
  });
});

describe('switchAccountAction', () => {
  it('signs this device out and returns to sign-in, keeping the invitation', async () => {
    await expect(
      navigatesTo(() => switchAccountAction(formData({ token: TOKEN }))),
    ).resolves.toBe(
      `/login?next=${encodeURIComponent(`/invitations/accept?token=${TOKEN}`)}`,
    );
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(cookieDeletes).toEqual(['domus-context']);
  });

  it('goes to plain sign-in for a malformed token', async () => {
    await expect(
      navigatesTo(() => switchAccountAction(formData({ token: 'nope' }))),
    ).resolves.toBe('/login');
  });
});
