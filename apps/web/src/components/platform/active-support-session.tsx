'use client';

import { formatDateTime } from '@domus/domain/format';
import { LifeBuoy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import type { PlatformFormState } from '@/lib/platform/form-state';

/**
 * An active session of this admin that this browser is not acting in (started elsewhere or its cookie was lost). The
 * database allows one active session per admin, so it has to be ended before another can start.
 */
export function ActiveSupportSession({
  sessionId,
  tenantName,
  expiresAt,
  end,
}: {
  sessionId: string;
  tenantName: string;
  expiresAt: string;
  end: (sessionId: string) => Promise<PlatformFormState>;
}) {
  const t = useTranslations('platform.support.active');
  const errorsT = useTranslations('platform.support.errors');
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-label={t('title')}
      className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-warning-bg p-5 text-warning"
    >
      <LifeBuoy
        aria-hidden="true"
        className="size-6 shrink-0"
        strokeWidth={2}
      />
      <div className="flex min-w-0 flex-1 basis-56 flex-col">
        <h2 className="text-app-subheading">{t('title')}</h2>
        <p className="text-app-body-dense">
          {t('summary', {
            tenant: tenantName,
            time: formatDateTime(expiresAt),
          })}
        </p>
      </div>
      {error ? (
        <AuthNotice tone="error">{errorsT('unknown')}</AuthNotice>
      ) : null}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await end(sessionId);
            setError(result.status === 'error');
          })
        }
      >
        {pending ? t('ending') : t('end')}
      </Button>
    </section>
  );
}
