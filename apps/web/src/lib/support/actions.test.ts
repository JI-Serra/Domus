// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigatesTo, redirect } from '@/test/server-mocks';
import { supportToken } from '@/test/support-token';

const cookieJar = new Map<string, string>();
const deleted: string[] = [];
const endSupportSession = vi.fn();
const actorClient = { kind: 'actor' };
const supportClient = { kind: 'support' };

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
      delete: (name: string) => deleted.push(name),
    }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@domus/supabase/platform', () => ({
  endSupportSession: (...args: unknown[]) => endSupportSession(...args),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createActorRequestClient: () => Promise.resolve(actorClient),
  createRequestClient: () => Promise.resolve(supportClient),
}));

const { endSupportAction } = await import('./actions');

const SESSION_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ID = '00000000-0000-4000-8000-0000000000bb';

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  deleted.length = 0;
  endSupportSession.mockResolvedValue({ error: null });
});

describe('endSupportAction', () => {
  it("closes the session with the admin's own client, clears the cookie and returns to the platform", async () => {
    cookieJar.set('domus-support', supportToken());
    await expect(navigatesTo(() => endSupportAction())).resolves.toBe(
      '/platform/support',
    );
    expect(endSupportSession).toHaveBeenCalledTimes(1);
    expect(endSupportSession).toHaveBeenCalledWith(actorClient, SESSION_ID);
    expect(deleted).toEqual(['domus-support']);
  });

  it('falls back to the support token when the admin client cannot end it', async () => {
    cookieJar.set('domus-support', supportToken());
    endSupportSession
      .mockResolvedValueOnce({ error: { code: '42501' } })
      .mockResolvedValueOnce({ error: null });
    await navigatesTo(() => endSupportAction());
    expect(endSupportSession).toHaveBeenNthCalledWith(
      2,
      supportClient,
      SESSION_ID,
    );
    expect(deleted).toEqual(['domus-support']);
  });

  it('still clears the cookie when everything throws', async () => {
    cookieJar.set('domus-support', supportToken());
    endSupportSession.mockRejectedValue(new Error('down'));
    await expect(navigatesTo(() => endSupportAction())).resolves.toBe(
      '/platform/support',
    );
    expect(deleted).toEqual(['domus-support']);
  });

  it('trusts the cookie over the id the page passes while the cookie is live', async () => {
    cookieJar.set('domus-support', supportToken());
    await navigatesTo(() => endSupportAction(OTHER_ID));
    expect(endSupportSession).toHaveBeenCalledWith(actorClient, SESSION_ID);
  });

  it('uses the id from the banner when the cookie has just expired', async () => {
    await navigatesTo(() => endSupportAction(OTHER_ID));
    expect(endSupportSession).toHaveBeenCalledWith(actorClient, OTHER_ID);
    expect(deleted).toEqual(['domus-support']);
  });

  it('ignores a malformed id and has nothing to end', async () => {
    await navigatesTo(() => endSupportAction('not-a-uuid'));
    expect(endSupportSession).not.toHaveBeenCalled();
    expect(deleted).toEqual(['domus-support']);
  });
});
