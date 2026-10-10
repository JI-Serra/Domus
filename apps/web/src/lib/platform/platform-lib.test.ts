// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { functionErrorCode } from './function-errors';
import { fieldError, formError, textValues } from './form-state';
import {
  getTenant,
  listInvitations,
  listSupportSessions,
  listTenants,
  sanitizeSearch,
  signedLogoUrl,
} from './data';

const getRequestContext = vi.fn();
const createRequestClient = vi.fn();
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: () => createRequestClient(),
}));
const { getPlatformClient } = await import('./guard');

describe('functionErrorCode', () => {
  const failure = (body: unknown) => ({
    context: new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
    ),
  });

  it.each([
    'invalid_input',
    'unauthorized',
    'forbidden',
    'origin_denied',
    'session_already_active',
    'method_not_allowed',
    'delivery_failed',
    'service_unavailable',
  ])('reads %s from the response body', async (code) => {
    await expect(functionErrorCode(failure({ code }))).resolves.toBe(code);
  });

  it('is "unknown" for anything else', async () => {
    await expect(
      functionErrorCode(failure({ code: 'surprise' })),
    ).resolves.toBe('unknown');
    await expect(functionErrorCode(failure({ code: 7 }))).resolves.toBe(
      'unknown',
    );
    await expect(functionErrorCode(failure('not json'))).resolves.toBe(
      'unknown',
    );
    await expect(functionErrorCode(new Error('network'))).resolves.toBe(
      'unknown',
    );
    await expect(functionErrorCode(null)).resolves.toBe('unknown');
  });
});

describe('form state helpers', () => {
  it('builds form and field errors that keep what was typed', () => {
    expect(formError('denied', { a: '1' })).toEqual({
      status: 'error',
      errors: {},
      formError: 'denied',
      values: { a: '1' },
    });
    expect(formError('denied')).toEqual({
      status: 'error',
      errors: {},
      formError: 'denied',
    });
    expect(fieldError({ name: 'nameRequired' })).toEqual({
      status: 'error',
      errors: { name: 'nameRequired' },
    });
  });

  it('reads text fields only, as strings', () => {
    const data = new FormData();
    data.set('a', 'x');
    data.set('file', new File(['x'], 'x.png'));
    expect(textValues(data, ['a', 'file', 'missing'])).toEqual({
      a: 'x',
      file: '',
      missing: '',
    });
  });
});

describe('sanitizeSearch', () => {
  it('keeps words and drops filter syntax', () => {
    expect(sanitizeSearch('  Los  Ceibos ')).toBe('Los Ceibos');
    expect(sanitizeSearch('a,b)or(c.eq.1%')).toBe('a b or c eq 1');
    expect(sanitizeSearch('Ñandú-2')).toBe('Ñandú-2');
    expect(sanitizeSearch('x'.repeat(300))).toHaveLength(100);
  });
});

/** Query builder double: every call returns itself and the awaited value is `result`. */
function builder(result: { data: unknown; error: { code: string } | null }) {
  const calls: [string, unknown[]][] = [];
  const proxy: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const name of ['select', 'order', 'limit', 'or', 'eq', 'maybeSingle'])
    proxy[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return proxy;
    };
  return { proxy, calls };
}
const clientFor = (b: ReturnType<typeof builder>) =>
  ({ from: () => b.proxy }) as never;

describe('platform data loaders', () => {
  it('searches tenants by sanitized name or slug', async () => {
    const b = builder({ data: [{ tenant_id: 't' }], error: null });
    await expect(listTenants(clientFor(b), 'Ceibos,x')).resolves.toEqual([
      { tenant_id: 't' },
    ]);
    expect(b.calls).toContainEqual([
      'or',
      ['tenant_name.ilike.%Ceibos x%,tenant_slug.ilike.%Ceibos x%'],
    ]);
  });

  it('lists all tenants without a filter', async () => {
    const b = builder({ data: [], error: null });
    await listTenants(clientFor(b));
    expect(b.calls.some(([name]) => name === 'or')).toBe(false);
  });

  it('fails loudly on database errors, with the code only', async () => {
    const b = builder({ data: null, error: { code: '42501' } });
    await expect(listTenants(clientFor(b))).rejects.toThrow(
      'Could not load tenants (42501)',
    );
    await expect(getTenant(clientFor(b), 't')).rejects.toThrow('(42501)');
    await expect(listInvitations(clientFor(b), 't')).rejects.toThrow('(42501)');
    await expect(listSupportSessions(clientFor(b))).rejects.toThrow('(42501)');
  });

  it('reads one tenant, its invitations and the support sessions of a barrio', async () => {
    const one = builder({ data: { tenant_id: 't' }, error: null });
    await expect(getTenant(clientFor(one), 't')).resolves.toEqual({
      tenant_id: 't',
    });
    const list = builder({ data: [], error: null });
    await listInvitations(clientFor(list), 't');
    expect(list.calls).toContainEqual(['eq', ['tenant_id', 't']]);
    const sessions = builder({ data: [], error: null });
    await listSupportSessions(clientFor(sessions), { tenantId: 't', limit: 5 });
    expect(sessions.calls).toContainEqual(['eq', ['tenant_id', 't']]);
    expect(sessions.calls).toContainEqual(['limit', [5]]);
  });

  it('signs the private logo, or returns null', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValueOnce({ data: { signedUrl: 'http://s/x' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'no' } });
    const client = {
      storage: { from: () => ({ createSignedUrl }) },
    } as never;
    await expect(signedLogoUrl(client, null)).resolves.toBeNull();
    await expect(signedLogoUrl(client, 't/logo.png')).resolves.toBe(
      'http://s/x',
    );
    await expect(signedLogoUrl(client, 't/logo.png')).resolves.toBeNull();
  });
});

describe('getPlatformClient', () => {
  const platform = { membership_id: 'platform' };
  beforeEach(() => {
    vi.clearAllMocks();
    createRequestClient.mockResolvedValue({ kind: 'client' });
  });
  const context = (overrides: Record<string, unknown> = {}) => ({
    identity: { userId: 'u', aal: 'aal2' },
    resolved: { options: [platform] },
    support: null,
    ...overrides,
  });

  it('returns the client only for a platform admin at aal2 outside a support session', async () => {
    getRequestContext.mockResolvedValue(context());
    await expect(getPlatformClient()).resolves.toEqual({ kind: 'client' });
  });

  it.each([
    ['nobody', null],
    ['an aal1 session', context({ identity: { userId: 'u', aal: 'aal1' } })],
    ['a support session', context({ support: { token: 't' } })],
    [
      'a user who is not a platform admin',
      context({ resolved: { options: [] } }),
    ],
  ])('refuses %s', async (_name, value) => {
    getRequestContext.mockResolvedValue(value);
    await expect(getPlatformClient()).resolves.toBeNull();
    expect(createRequestClient).not.toHaveBeenCalled();
  });
});
