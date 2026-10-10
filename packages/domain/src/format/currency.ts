import { DISPLAY_LOCALE } from './constants';

const arsFormatter = new Intl.NumberFormat(DISPLAY_LOCALE, {
  style: 'currency',
  currency: 'ARS',
  currencyDisplay: 'symbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an `_amount` column (`numeric(14,2)`, ARS) as `$ 1.234,56`.
 *
 * The symbol and the number are separated by a no-break space (U+00A0) so they never wrap apart.
 * Accepts the string form too, because numeric columns can arrive as strings. Throws `RangeError` for
 * values that are not finite numbers so a corrupt amount never renders as "$ NaN".
 */
export function formatCurrencyArs(amount: number | string): string {
  const value =
    typeof amount === 'string'
      ? Number(amount.trim() === '' ? NaN : amount)
      : amount;
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `Expected a finite ARS amount, received "${String(amount)}"`,
    );
  }
  // Avoid "-$ 0,00" for amounts that round to zero.
  return arsFormatter.format(
    Object.is(value, -0) || Math.abs(value) < 0.005 ? 0 : value,
  );
}
