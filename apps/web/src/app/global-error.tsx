'use client';

import { useEffect } from 'react';
import { reportError } from '@domus/observability';

// Last-resort boundary: it replaces the root layout, so it renders its own <html>.
// The copy is intentionally minimal; i18n messages are not available at this level.
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
          <h1>Algo salió mal</h1>
          <p>Ocurrió un error inesperado. Ya fue registrado.</p>
          <button
            type="button"
            onClick={reset}
            style={{ minHeight: 44, minWidth: 44, padding: '0.5rem 1rem' }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
