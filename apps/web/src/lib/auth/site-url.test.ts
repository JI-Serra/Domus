import { describe, expect, it } from 'vitest';
import { siteUrlFromHeaders } from './site-url';

describe('siteUrlFromHeaders', () => {
  it('uses http for local hosts', () => {
    expect(siteUrlFromHeaders(new Headers({ host: '127.0.0.1:3000' }))).toBe(
      'http://127.0.0.1:3000',
    );
    expect(siteUrlFromHeaders(new Headers({ host: 'localhost:3000' }))).toBe(
      'http://localhost:3000',
    );
  });

  it('uses https for other hosts and honors forwarding headers', () => {
    expect(siteUrlFromHeaders(new Headers({ host: 'app.domus.example' }))).toBe(
      'https://app.domus.example',
    );
    expect(
      siteUrlFromHeaders(
        new Headers({
          host: 'internal:3000',
          'x-forwarded-host': 'app.domus.example',
          'x-forwarded-proto': 'https, http',
        }),
      ),
    ).toBe('https://app.domus.example');
  });

  it('falls back to the local default without a host', () => {
    expect(siteUrlFromHeaders(new Headers())).toBe('http://127.0.0.1:3000');
  });
});
