import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseEnvironment } from './env';

const validEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
};
afterEach(() => vi.unstubAllEnvs());

describe('Supabase environment', () => {
  it('reads the public environment variables', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      validEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    );
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      validEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    expect(getSupabaseEnvironment()).toEqual(validEnvironment);
  });
  it('keeps only the public client configuration', () => {
    expect(
      getSupabaseEnvironment({
        ...validEnvironment,
        SUPABASE_SERVICE_ROLE_KEY: 'ignored',
      }),
    ).toEqual(validEnvironment);
  });
  it.each([
    {},
    { ...validEnvironment, NEXT_PUBLIC_SUPABASE_URL: 'invalid' },
    { ...validEnvironment, NEXT_PUBLIC_SUPABASE_URL: 'ftp://example.com' },
    { ...validEnvironment, NEXT_PUBLIC_SUPABASE_ANON_KEY: '   ' },
  ])('rejects invalid configuration %j', (input) => {
    expect(() => getSupabaseEnvironment(input)).toThrow();
  });
});
