'use client';

import { useEffect } from 'react';
import { reportError } from '@domus/observability';
import messages from '../../messages/es-AR.json';

// Last-resort boundary: it replaces the root layout, so it renders its own <html>.
// The next-intl provider is not available at this level, so the copy is read from the catalog directly.
const copy = messages.globalError;
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { source: 'global-error', digest: error.digest });
  }, [error]);

  return (
    <html lang="es-AR">
      <body>
        <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, minWidth: 44, padding: '0.5rem 1rem' }}
          >
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
