import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionIdentity } from './session';

function clientWith(result: unknown) {
  return {
    auth: { getClaims: () => Promise.resolve(result) },
  } as unknown as Pick<SupabaseClient, 'auth'>;
}

describe('getSessionIdentity', () => {
  it('returns the verified identity', async () => {
    await expect(
      getSessionIdentity(
        clientWith({
          data: { claims: { sub: 'user-1', email: 'a@b.c', aal: 'aal1' } },
          error: null,
        }),
      ),
    ).resolves.toEqual({ userId: 'user-1', email: 'a@b.c', aal: 'aal1' });
  });

  it('reports aal2 only when the claim says so', async () => {
    const aal2 = await getSessionIdentity(
      clientWith({ data: { claims: { sub: 'u', aal: 'aal2' } }, error: null }),
    );
    expect(aal2).toEqual({ userId: 'u', email: null, aal: 'aal2' });
    const odd = await getSessionIdentity(
      clientWith({ data: { claims: { sub: 'u', aal: 'aal3' } }, error: null }),
    );
    expect(odd?.aal).toBe('aal1');
  });

  it.each([
    ['an error', { data: null, error: new Error('invalid JWT') }],
    ['no claims', { data: null, error: null }],
    ['a missing subject', { data: { claims: { aal: 'aal1' } }, error: null }],
    ['an empty subject', { data: { claims: { sub: '' } }, error: null }],
  ])('returns null for %s', async (_label, result) => {
    await expect(getSessionIdentity(clientWith(result))).resolves.toBeNull();
  });
});
