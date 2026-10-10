import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_TIME_ZONE,
  formatCurrencyArs,
  formatDate,
  formatDateTime,
} from './index';

const NBSP = ' ';

describe('formatCurrencyArs', () => {
  it('formats with the peso sign, dot thousands and decimal comma', () => {
    expect(formatCurrencyArs(1234.56)).toBe(`$${NBSP}1.234,56`);
  });

  it('always shows two decimals', () => {
    expect(formatCurrencyArs(5)).toBe(`$${NBSP}5,00`);
    expect(formatCurrencyArs(0.5)).toBe(`$${NBSP}0,50`);
  });

  it('groups millions', () => {
    expect(formatCurrencyArs(1234567.89)).toBe(`$${NBSP}1.234.567,89`);
  });

  it('formats negative amounts', () => {
    expect(formatCurrencyArs(-1500)).toBe(`-$${NBSP}1.500,00`);
  });

  it('accepts numeric strings, as numeric columns can arrive that way', () => {
    expect(formatCurrencyArs('1234.5')).toBe(`$${NBSP}1.234,50`);
  });

  it('never renders a negative zero', () => {
    expect(formatCurrencyArs(0)).toBe(`$${NBSP}0,00`);
    expect(formatCurrencyArs(-0)).toBe(`$${NBSP}0,00`);
    expect(formatCurrencyArs(-0.001)).toBe(`$${NBSP}0,00`);
  });

  it.each([NaN, Infinity, 'abc', ''])(
    'rejects non-finite amount %s',
    (value) => {
      expect(() => formatCurrencyArs(value)).toThrow(RangeError);
    },
  );
});

describe('formatDate', () => {
  it('converts a UTC instant to the Tucumán calendar day (UTC-3)', () => {
    // 02:30 UTC on the 10th is still the 9th at 23:30 in Tucumán.
    expect(formatDate('2026-10-10T02:30:00Z')).toBe('09/10/2026');
    expect(formatDate('2026-10-10T03:00:00Z')).toBe('10/10/2026');
  });

  it('uses the explicit time zone', () => {
    expect(formatDate('2026-10-10T02:30:00Z', 'UTC')).toBe('10/10/2026');
    expect(formatDate('2026-10-10T02:30:00Z', 'Asia/Tokyo')).toBe('10/10/2026');
    expect(formatDate('2026-10-09T20:00:00Z', 'Asia/Tokyo')).toBe('10/10/2026');
  });

  it('accepts Date objects and ISO strings with an offset', () => {
    expect(formatDate(new Date('2026-01-05T12:00:00Z'))).toBe('05/01/2026');
    expect(formatDate('2026-01-05T09:00:00-03:00')).toBe('05/01/2026');
  });

  it('formats a date-only value as the same calendar day, ignoring the time zone', () => {
    expect(formatDate('2026-10-09')).toBe('09/10/2026');
    expect(formatDate('2026-10-09', 'Pacific/Kiritimati')).toBe('09/10/2026');
  });

  it('rejects impossible or malformed dates', () => {
    expect(() => formatDate('2026-02-31')).toThrow(RangeError);
    expect(() => formatDate('not-a-date')).toThrow(RangeError);
    expect(() => formatDate(new Date(NaN))).toThrow(RangeError);
  });

  it('rejects an unknown time zone', () => {
    expect(() => formatDate('2026-10-10T02:30:00Z', 'Mars/Olympus')).toThrow(
      RangeError,
    );
  });
});

describe('formatDateTime', () => {
  it('converts UTC to Tucumán time with a 24-hour clock', () => {
    expect(formatDateTime('2026-10-09T18:30:00Z')).toBe('09/10/2026 15:30');
  });

  it('crosses midnight backwards', () => {
    expect(formatDateTime('2026-10-10T02:05:00Z')).toBe('09/10/2026 23:05');
  });

  it('renders midnight as 00:00, not 24:00', () => {
    expect(formatDateTime('2026-10-09T03:00:00Z')).toBe('09/10/2026 00:00');
  });

  it('uses the tenant time zone when given', () => {
    expect(
      formatDateTime('2026-10-09T18:30:00Z', 'America/Argentina/Buenos_Aires'),
    ).toBe('09/10/2026 15:30');
    expect(formatDateTime('2026-10-09T18:30:00Z', 'Europe/Madrid')).toBe(
      '09/10/2026 20:30',
    );
    expect(formatDateTime('2026-10-09T18:30:00Z', 'UTC')).toBe(
      '09/10/2026 18:30',
    );
  });

  it('rejects invalid input', () => {
    expect(() => formatDateTime('nope')).toThrow(RangeError);
  });

  it('exposes the default tenant time zone', () => {
    expect(DEFAULT_TENANT_TIME_ZONE).toBe('America/Argentina/Tucuman');
  });
});
