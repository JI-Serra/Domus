/** Codes the platform Edge Functions answer with (`reports/M01-db.md`, "Edge endpoints"). */
export type FunctionErrorCode =
  | 'invalid_input'
  | 'unauthorized'
  | 'forbidden'
  | 'origin_denied'
  | 'session_already_active'
  | 'method_not_allowed'
  | 'delivery_failed'
  | 'service_unavailable'
  | 'unknown';

const KNOWN: readonly string[] = [
  'invalid_input',
  'unauthorized',
  'forbidden',
  'origin_denied',
  'session_already_active',
  'method_not_allowed',
  'delivery_failed',
  'service_unavailable',
];

/**
 * The function code of a failed `functions.invoke` call. A non-2xx answer arrives as an error whose `context` is
 * the HTTP response; its JSON body carries `{ code }`. Anything unexpected (network, malformed body) is `unknown`,
 * which the UI words as a generic retryable failure. Bodies are never shown or logged.
 */
export async function functionErrorCode(
  error: unknown,
): Promise<FunctionErrorCode> {
  const context = (error as { context?: unknown } | null)?.context;
  if (!(context instanceof Response)) return 'unknown';
  try {
    const body: unknown = await context.clone().json();
    const code = (body as { code?: unknown } | null)?.code;
    return typeof code === 'string' && KNOWN.includes(code)
      ? (code as FunctionErrorCode)
      : 'unknown';
  } catch {
    return 'unknown';
  }
}
