import { DEFAULT_TENANT_TIME_ZONE, DISPLAY_LOCALE } from './constants';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

type Instant = Date | string;

function toDate(value: Instant): Date {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: "${String(value)}"`);
  }
  return date;
}

function partsOf(
  date: Date,
  timeZone: string,
  withTime: boolean,
): Record<string, string> {
  const formatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime
      ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }
      : {}),
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date))
    parts[part.type] = part.value;
  return parts;
}

/**
 * Formats an instant as `dd/mm/yyyy` in the given IANA time zone (the tenant's; default Tucumán).
 *
 * A `date` column value (`"2026-10-09"`, no time) is a calendar day, not an instant, so it is formatted as is
 * and never shifted by the time zone.
 */
export function formatDate(
  value: Instant,
  timeZone: string = DEFAULT_TENANT_TIME_ZONE,
): string {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value);
    if (match) {
      const [, year, month, day] = match;
      // Validate the calendar day (e.g. reject 2026-02-31) by round-tripping through UTC.
      const probe = new Date(
        Date.UTC(Number(year), Number(month) - 1, Number(day)),
      );
      if (
        probe.getUTCMonth() !== Number(month) - 1 ||
        probe.getUTCDate() !== Number(day)
      ) {
        throw new RangeError(`Invalid date: "${value}"`);
      }
      return `${day}/${month}/${year}`;
    }
  }
  const parts = partsOf(toDate(value), timeZone, false);
  return `${parts.day}/${parts.month}/${parts.year}`;
}

/** Formats an instant as `dd/mm/yyyy HH:mm` (24-hour clock) in the given IANA time zone. */
export function formatDateTime(
  value: Instant,
  timeZone: string = DEFAULT_TENANT_TIME_ZONE,
): string {
  const parts = partsOf(toDate(value), timeZone, true);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
