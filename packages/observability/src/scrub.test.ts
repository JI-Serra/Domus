import { describe, expect, it } from 'vitest';
import { isSensitiveKey, scrubPii, scrubString } from './scrub';

describe('scrubString', () => {
  it('masks emails', () => {
    expect(scrubString('failed for juan.perez+x@example.com.ar today')).toBe(
      'failed for [email] today',
    );
  });

  it('masks DNI with and without dots', () => {
    expect(scrubString('DNI 30123456 y 12.345.678')).toBe(
      'DNI [document] y [document]',
    );
    expect(scrubString('DNI 1234567')).toBe('DNI [document]');
  });

  it('masks Argentine phone numbers', () => {
    expect(scrubString('call +54 9 11 1234-5678')).toBe('call [phone]');
    expect(scrubString('call 11 1234-5678')).toBe('call [phone]');
    expect(scrubString('call (011) 4123-4567')).toBe('call [phone]');
    expect(scrubString('call 1112345678')).toBe('call [phone]');
  });

  it('masks JWTs and bearer tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc_DEF-123';
    expect(scrubString(`token=${jwt}`)).toBe('token=[token]');
    expect(scrubString('Authorization: Bearer abcdef123456')).toBe(
      'Authorization: Bearer [token]',
    );
  });

  it('does not mistake package@version paths for emails', () => {
    const path = 'node_modules/.pnpm/next@16.4.0_react@19.3.0/next/dist/x.js';
    expect(scrubString(path)).toBe(path);
  });

  it('keeps UUIDs, ISO dates and short numbers intact', () => {
    const text =
      'tenant 3f2a9c1e-12345678-4b1c at 2026-10-09T10:20:30.000Z took 250 ms, unit 4521';
    expect(scrubString(text)).toBe(text);
  });
});

describe('isSensitiveKey', () => {
  it.each([
    'email',
    'user_email',
    'phone',
    'Password',
    'access_token',
    'person_document_number',
    'dni',
  ])('flags %s', (key) => expect(isSensitiveKey(key)).toBe(true));

  it.each(['tenantId', 'unit_name', 'membershipRole', 'path'])(
    'does not flag %s',
    (key) => expect(isSensitiveKey(key)).toBe(false),
  );
});

describe('scrubPii', () => {
  it('redacts sensitive keys recursively, including inside arrays', () => {
    const result = scrubPii({
      tenantId: 't-1',
      user: {
        email: 'a@b.com',
        person_document_number: '30123456',
        nested: [{ password: 'x', ok: 1 }],
      },
    });
    expect(result).toEqual({
      tenantId: 't-1',
      user: {
        email: '[REDACTED]',
        person_document_number: '[REDACTED]',
        nested: [{ password: '[REDACTED]', ok: 1 }],
      },
    });
  });

  it('scrubs string values under harmless keys', () => {
    expect(scrubPii({ note: 'write to a@b.com' })).toEqual({
      note: 'write to [email]',
    });
  });

  it('does not mutate the input', () => {
    const input = { email: 'a@b.com' };
    scrubPii(input);
    expect(input.email).toBe('a@b.com');
  });

  it('handles circular references, dates, errors, functions and primitives', () => {
    const circular: Record<string, unknown> = { name: 'x' };
    circular.self = circular;
    const out = scrubPii({
      circular,
      when: new Date('2026-10-09T00:00:00.000Z'),
      err: new Error('boom for a@b.com'),
      fn: () => 1,
      count: 3,
      nothing: null,
    }) as unknown as {
      circular: { self: unknown };
      when: unknown;
      err: { message: string };
      fn: unknown;
      count: unknown;
      nothing: unknown;
    };
    expect(out.circular.self).toBe('[Circular]');
    expect(out.when).toBe('2026-10-09T00:00:00.000Z');
    expect(out.err.message).toBe('boom for [email]');
    expect(out.fn).toBeUndefined();
    expect(out.count).toBe(3);
    expect(out.nothing).toBeNull();
  });

  it('truncates very deep structures', () => {
    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 12; i++) deep = { child: deep };
    expect(JSON.stringify(scrubPii(deep))).toContain('[Truncated]');
  });
});
