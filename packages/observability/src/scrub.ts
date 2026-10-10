const REDACTED = '[REDACTED]';
const MAX_DEPTH = 8;

/** Key fragments whose value is always dropped (compared lowercase, without `_`, `-`, spaces). */
const SENSITIVE_KEY_PARTS = [
  'email',
  'phone',
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'documentnumber',
  'dni',
];

const JWT = /\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const BEARER = /\b(Bearer|Basic)\s+[\w.~+/=-]{8,}/gi;
const EMAIL = /[\w.+%-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g;
// +54 9 11 1234-5678, (011) 4123-4567, 11 1234-5678, 1112345678
const PHONE_INTL = /\+\d[\d ().-]{7,}\d/g;
const PHONE_LOCAL = /(?<![\w.-])\(?\d{2,4}\)?[ .-]\d{3,4}[ .-]\d{4}(?![\w-])/g;
const PHONE_PLAIN = /(?<![\w.-])\d{10,11}(?![\w-])/g;
// DNI: 12.345.678 or 12345678 (7-8 digits), not part of a UUID or identifier
const DNI_DOTTED = /(?<![\w.-])\d{1,2}\.\d{3}\.\d{3}(?![\w-])/g;
const DNI_PLAIN = /(?<![\w.-])\d{7,8}(?![\w-])/g;

export function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_\-\s]/g, '');
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part));
}

export function scrubString(value: string): string {
  return value
    .replace(JWT, '[token]')
    .replace(BEARER, '$1 [token]')
    .replace(EMAIL, '[email]')
    .replace(PHONE_INTL, '[phone]')
    .replace(PHONE_LOCAL, '[phone]')
    .replace(PHONE_PLAIN, '[phone]')
    .replace(DNI_DOTTED, '[document]')
    .replace(DNI_PLAIN, '[document]');
}

/**
 * Recursively removes personal data from any value: sensitive keys are replaced
 * with `[REDACTED]`, and emails, phones, DNIs and tokens inside strings are masked.
 * Returns a new value; the input is never mutated.
 */
export function scrubPii<T>(value: T): T {
  return scrub(value, new WeakSet(), 0) as T;
}

function scrub(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value === 'function' || typeof value === 'symbol')
    return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);
  try {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: scrubString(value.message),
        stack: value.stack ? scrubString(value.stack) : undefined,
      };
    }
    if (Array.isArray(value))
      return value.map((item) => scrub(item, seen, depth + 1));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSensitiveKey(key)
        ? REDACTED
        : scrub(item, seen, depth + 1);
    }
    return result;
  } finally {
    seen.delete(value);
  }
}
