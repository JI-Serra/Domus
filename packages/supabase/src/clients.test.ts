import { beforeEach, expect, it, vi } from 'vitest';
import {
  createBrowserClient as createSsrBrowserClient,
  createServerClient as createSsrServerClient,
} from '@supabase/ssr';
import { createBrowserClient } from './browser';
import { createServerClient } from './server';

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({ kind: 'browser' })),
  createServerClient: vi.fn(() => ({ kind: 'server' })),
}));
const environment = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key',
};
beforeEach(() => vi.clearAllMocks());

it('creates the typed browser client with validated public credentials', () => {
  expect(createBrowserClient(environment)).toEqual({ kind: 'browser' });
  expect(createSsrBrowserClient).toHaveBeenCalledWith(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
});
it('passes the request cookie adapter to the server client', () => {
  const cookies = { getAll: () => [], setAll: vi.fn() };
  expect(createServerClient(cookies, environment)).toEqual({ kind: 'server' });
  expect(createSsrServerClient).toHaveBeenCalledWith(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies },
  );
});
it('rejects invalid credentials before creating either client', () => {
  const invalid = { ...environment, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' };
  expect(() => createBrowserClient(invalid)).toThrow();
  expect(() => createServerClient({ getAll: () => [] }, invalid)).toThrow();
  expect(createSsrBrowserClient).not.toHaveBeenCalled();
  expect(createSsrServerClient).not.toHaveBeenCalled();
});
