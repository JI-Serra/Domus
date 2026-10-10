import { describe, expect, it } from 'vitest';
import { isPublicPath, loginUrlFor, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/', '/'],
    ['/access', '/access'],
    ['/access?tab=1#top', '/access?tab=1#top'],
    ['/registry/people?q=a%20b', '/registry/people?q=a%20b'],
  ])('keeps the same-origin path %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    'https://evil.example/',
    '//evil.example',
    '///evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    'access',
    '',
    '/ok\nSet-Cookie: x=1',
    '/ok\u0000',
  ])('rejects %j', (input) => {
    expect(safeNextPath(input)).toBe('/');
  });

  it('rejects non-strings and uses the given fallback', () => {
    expect(safeNextPath(undefined)).toBe('/');
    expect(safeNextPath(['/a'])).toBe('/');
    expect(safeNextPath(null, '/reset-password')).toBe('/reset-password');
  });
});

describe('loginUrlFor', () => {
  it('carries the return path', () => {
    expect(loginUrlFor('/access?x=1')).toBe('/login?next=%2Faccess%3Fx%3D1');
  });

  it('omits the return path for the home page and for unsafe values', () => {
    expect(loginUrlFor('/')).toBe('/login');
    expect(loginUrlFor('//evil.example')).toBe('/login');
  });
});

describe('isPublicPath', () => {
  it.each([
    '/login',
    '/forgot-password',
    '/reset-password',
    '/auth/callback',
    '/design',
    '/design/anything',
    '/api/debug/error',
  ])('%s is public', (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each([
    '/',
    '/access',
    '/registry',
    '/api/other',
    '/api/debug/error/extra',
    '/designer',
    '/authors',
    '/login/extra',
  ])('%s needs a session', (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});
