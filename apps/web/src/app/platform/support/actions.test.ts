// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData, navigatesTo, redirect } from '@/test/server-mocks';
import { supportToken } from '@/test/support-token';

const getPlatformClient = vi.fn();
const startSupportSession = vi.fn();
const endSupportSession = vi.fn();
const revalidatePath = vi.fn();
const cookieSets: { name: string; value: string; options: unknown }[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      set: (name: string, value: string, options: unknown) =>
        cookieSets.push({ name, value, options }),
    }),
  headers: () => Promise.resolve(new Headers({ host: '127.0.0.1:3000' })),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/platform/guard', () => ({
  getPlatformClient: () => getPlatformClient(),
}));
vi.mock('@domus/supabase/platform', () => ({
  startSupportSession: (...args: unknown[]) => startSupportSession(...args),
  endSupportSession: (...args: unknown[]) => endSupportSession(...args),
}));

const {
  endOwnSupportSessionAction,
  lookupSupportTargetsAction,
  startSupportAction,
} = await import('./actions');

const IDLE = { status: 'idle' } as const;
const TENANT = '10000000-0000-4000-8000-000000000001';
const USER = '20000000-0000-4000-8000-000000000002';
const EVENT = '80000000-0000-4000-8000-000000000001';
const SESSION = '00000000-0000-4000-8000-0000000000aa';
const client = { rpc: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  cookieSets.length = 0;
  getPlatformClient.mockResolvedValue(client);
  endSupportSession.mockResolvedValue({ error: null });
});

describe('lookupSupportTargetsAction', () => {
  it('asks the audited database function, with the search text only when there is one', async () => {
    client.rpc.mockResolvedValue({ data: [{ user_id: USER }], error: null });
    await expect(lookupSupportTargetsAction(TENANT, '  ana ')).resolves.toEqual(
      {
        ok: true,
        targets: [{ user_id: USER }],
      },
    );
    expect(client.rpc).toHaveBeenCalledWith('list_support_targets', {
      target_tenant_id: TENANT,
      search: 'ana',
    });
    await lookupSupportTargetsAction(TENANT, '   ');
    expect(client.rpc).toHaveBeenLastCalledWith('list_support_targets', {
      target_tenant_id: TENANT,
      search: undefined,
    });
  });

  it('refuses a non-admin or a bad id without calling the database', async () => {
    getPlatformClient.mockResolvedValue(null);
    await expect(lookupSupportTargetsAction(TENANT, '')).resolves.toEqual({
      ok: false,
      error: 'denied',
    });
    getPlatformClient.mockResolvedValue(client);
    await expect(lookupSupportTargetsAction('x', '')).resolves.toEqual({
      ok: false,
      error: 'denied',
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('distinguishes a denial from a failure', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { code: '42501' } });
    await expect(lookupSupportTargetsAction(TENANT, '')).resolves.toEqual({
      ok: false,
      error: 'denied',
    });
    client.rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(lookupSupportTargetsAction(TENANT, '')).resolves.toEqual({
      ok: false,
      error: 'lookupFailed',
    });
  });
});

describe('startSupportAction', () => {
  const form = (overrides: Record<string, string> = {}) =>
    formData({
      target_tenant_id: TENANT,
      target_user_id: USER,
      reason: ' Revisar un acceso ',
      duration_minutes: '30',
      client_event_id: EVENT,
      ...overrides,
    });
  const started = (token = supportToken()) => ({
    data: {
      access_token: token,
      expires_at: 'x',
      support_session_id: SESSION,
      tenant_id: TENANT,
      target_user_id: USER,
    },
    error: null,
  });

  it('starts the session, keeps the token in an httpOnly cookie and opens the app as the user', async () => {
    startSupportSession.mockResolvedValue(started());
    await expect(
      navigatesTo(() => startSupportAction(IDLE, form())),
    ).resolves.toBe('/');
    expect(startSupportSession).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_user_id: USER,
      reason: 'Revisar un acceso',
      duration_minutes: 30,
      client_event_id: EVENT,
    });
    expect(cookieSets).toHaveLength(1);
    expect(cookieSets[0]).toMatchObject({
      name: 'domus-support',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    });
    expect(cookieSets[0]?.value.split('.')).toHaveLength(3);
  });

  it('validates the form first and keeps what was typed', async () => {
    const state = await startSupportAction(
      IDLE,
      form({ reason: ' ', duration_minutes: '99', target_user_id: '' }),
    );
    expect(state).toMatchObject({
      errors: {
        reason: 'reasonRequired',
        duration_minutes: 'durationInvalid',
        target_user_id: 'userRequired',
      },
      values: { target_tenant_id: TENANT },
    });
    expect(startSupportSession).not.toHaveBeenCalled();
  });

  it('refuses a non-admin and a missing retry key', async () => {
    getPlatformClient.mockResolvedValue(null);
    expect(await startSupportAction(IDLE, form())).toMatchObject({
      formError: 'denied',
    });
    getPlatformClient.mockResolvedValue(client);
    expect(
      await startSupportAction(IDLE, form({ client_event_id: 'x' })),
    ).toMatchObject({ formError: 'unknown' });
  });

  const failure = (code: string) => ({
    data: null,
    error: { context: new Response(JSON.stringify({ code }), { status: 403 }) },
  });
  it.each([
    ['session_already_active', 'sessionActive'],
    ['forbidden', 'denied'],
    ['unauthorized', 'denied'],
    ['service_unavailable', 'unavailable'],
    ['invalid_input', 'invalid'],
    ['surprise', 'unknown'],
  ])('maps function code %s to %s and sets no cookie', async (code, key) => {
    startSupportSession.mockResolvedValue(failure(code));
    expect(await startSupportAction(IDLE, form())).toMatchObject({
      formError: key,
    });
    expect(cookieSets).toHaveLength(0);
  });

  it('closes a session whose token cannot be used instead of leaving it running', async () => {
    startSupportSession.mockResolvedValue(started('not-a-token'));
    expect(await startSupportAction(IDLE, form())).toMatchObject({
      formError: 'unknown',
    });
    expect(endSupportSession).toHaveBeenCalledWith(client, SESSION);
    expect(cookieSets).toHaveLength(0);
  });
});

describe('endOwnSupportSessionAction', () => {
  it('ends the admin’s own session', async () => {
    expect(await endOwnSupportSessionAction(SESSION)).toEqual({
      status: 'success',
    });
    expect(endSupportSession).toHaveBeenCalledWith(client, SESSION);
    expect(revalidatePath).toHaveBeenCalledWith('/platform/support');
  });

  it('maps failures and refuses bad input', async () => {
    endSupportSession.mockResolvedValue({ error: { code: '42501' } });
    expect(await endOwnSupportSessionAction(SESSION)).toMatchObject({
      formError: 'denied',
    });
    endSupportSession.mockResolvedValue({ error: { code: 'XX000' } });
    expect(await endOwnSupportSessionAction(SESSION)).toMatchObject({
      formError: 'unknown',
    });
    expect(await endOwnSupportSessionAction('x')).toMatchObject({
      formError: 'denied',
    });
    getPlatformClient.mockResolvedValue(null);
    expect(await endOwnSupportSessionAction(SESSION)).toMatchObject({
      formError: 'denied',
    });
  });
});
