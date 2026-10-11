import { reportError } from '@domus/observability';

interface RpcError {
  code?: string;
  message?: string;
}

/**
 * Message key (`accessPolicy.errors.*`) for a failed policy RPC. Raw database text never travels to the browser:
 * only the SQLSTATE decides, plus the one message that tells a refused retry from a refused caller. Unexpected
 * failures are reported (without PII).
 */
export function accessPolicyErrorKey(
  error: RpcError,
  operation: string,
): string {
  switch (error.code) {
    case '42501':
      return (error.message ?? '').toLowerCase().includes('retry')
        ? 'retryConflict'
        : 'denied';
    case '22023':
      return 'invalid';
    case '40P01':
    case '40001':
    case '55P03':
      return 'busy';
    default:
      reportError(
        new Error(`${operation} failed (${error.code ?? 'no code'})`),
        { operation },
      );
      return 'unknown';
  }
}
