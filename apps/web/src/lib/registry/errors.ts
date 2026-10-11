import { reportError } from '@domus/observability';

interface RpcError {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * Message key (`registry.errors.*`) for a failed registry RPC. Raw database text never travels to the browser:
 * only the SQLSTATE and a few constraint names decide the key. Unexpected failures are reported (without PII).
 */
export function registryErrorKey(error: RpcError, operation: string): string {
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();
  switch (error.code) {
    case '42501':
      return 'denied';
    case '22023':
      return 'invalid';
    case '23514':
      if (text.includes('identity')) return 'identityTaken';
      return text.includes('holder') || text.includes('occupied')
        ? 'occupiedNeedsHolder'
        : 'invalid';
    case '23505':
      if (text.includes('unit_code')) return 'unitCodeTaken';
      if (text.includes('plate')) return 'plateTaken';
      if (text.includes('email') || text.includes('document'))
        return 'personTaken';
      return 'duplicate';
    case '23503':
      return 'invalid';
    // Deadlock, serialization failure, lock timeout: another change was in flight; trying again is the answer.
    case '40P01':
    case '40001':
    case '55P03':
      return 'busy';
    default:
      reportError(
        new Error(`${operation} failed (${error.code ?? 'no code'})`),
        {
          operation,
        },
      );
      return 'unknown';
  }
}
