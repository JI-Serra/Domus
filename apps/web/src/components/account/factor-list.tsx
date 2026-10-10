'use client';

import { formatDate } from '@domus/domain/format';
import { Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { removeFactorAction } from '@/app/(account)/account/security/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { challengeUrlFor, MFA_SETTINGS_PATH } from '@/lib/auth/mfa';
import type { VerifiedFactor } from '@/lib/auth/mfa';

/**
 * The user's verified factors, each with a two-step removal (a destructive action asks for confirmation). Removing
 * needs `aal2`; when the server says so, the way to confirm identity is offered right in the message.
 */
export function FactorList({
  factors,
}: {
  factors: readonly VerifiedFactor[];
}) {
  const t = useTranslations('account.security.factors');
  const errors = useTranslations('auth.errors');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<{
    message: string;
    reauth: boolean;
  } | null>(null);
  const [removing, startTransition] = useTransition();

  if (factors.length === 0)
    return <p className="text-text-secondary">{t('empty')}</p>;

  const remove = (factorId: string) =>
    startTransition(async () => {
      const result = await removeFactorAction(factorId);
      if (result.ok) {
        setError(null);
        setConfirming(null);
      } else {
        setError({
          message: errors(result.error),
          reauth: result.error === 'mfaReauthRequired',
        });
        setConfirming(null);
      }
    });

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <AuthNotice tone="error">
          {error.message}
          {error.reauth ? (
            <>
              {' '}
              <Link
                href={challengeUrlFor(MFA_SETTINGS_PATH)}
                className="underline underline-offset-4"
              >
                {t('reauth')}
              </Link>
            </>
          ) : null}
        </AuthNotice>
      ) : null}
      <ul className="flex flex-col gap-3">
        {factors.map((factor) => (
          <li
            key={factor.id}
            className="flex flex-wrap items-center gap-3 rounded-card-dense bg-surface-0 p-4"
          >
            <Smartphone
              aria-hidden="true"
              className="size-6 shrink-0 text-text-secondary"
              strokeWidth={1.75}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-app-subheading">
                {factor.name}
              </span>
              <span className="text-app-caption text-text-secondary">
                {t('addedOn', { date: formatDate(factor.createdAt) })}
              </span>
            </div>
            {confirming === factor.id ? (
              <div
                role="group"
                aria-label={t('confirmTitle')}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-app-body-dense">{t('confirmTitle')}</span>
                <Button
                  variant="destructive"
                  onClick={() => remove(factor.id)}
                  disabled={removing}
                >
                  {removing ? t('removing') : t('confirm')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirming(null)}
                  disabled={removing}
                >
                  {t('keep')}
                </Button>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => setConfirming(factor.id)}
              >
                {t('remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
