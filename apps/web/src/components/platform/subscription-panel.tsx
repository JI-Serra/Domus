'use client';

import {
  tenantSubscriptionStatuses,
  tenantSubscriptionStatusSchema,
} from '@domus/domain/tenant/subscription-status';
import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field, Select } from '@/components/ui/field';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { SubscriptionBadge } from './subscription-badge';

/**
 * Subscription status of a barrio (M01-F02) with a confirmation that states the effect of the change before it is
 * applied: suspended is read-only, cancelled closes access.
 */
export function SubscriptionPanel({
  current,
  change,
}: {
  current: TenantSubscriptionStatus;
  change: (status: string) => Promise<PlatformFormState>;
}) {
  const t = useTranslations('platform.tenants.subscription');
  const statusT = useTranslations('platform.tenants.status');
  const errorsT = useTranslations('platform.tenants.errors');
  const notices = useTranslations('platform.tenants.notices');
  const [next, setNext] = useState<TenantSubscriptionStatus>(
    tenantSubscriptionStatuses.find((status) => status !== current) ?? current,
  );
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PlatformFormState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();

  const apply = () =>
    startTransition(async () => {
      const outcome = await change(next);
      setResult(outcome);
      setConfirming(false);
    });

  const errorKey =
    result.status === 'error' ? (result.formError ?? 'unknown') : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-app-subheading">{t('current')}</span>
        <SubscriptionBadge status={current} />
      </div>

      {errorKey ? (
        <AuthNotice tone="error">
          {errorsT.has(errorKey as 'unknown')
            ? errorsT(errorKey as 'unknown')
            : errorsT('unknown')}
        </AuthNotice>
      ) : null}
      {result.status === 'success' ? (
        <AuthNotice tone="success">{notices('statusChanged')}</AuthNotice>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('next')} className="min-w-48 flex-1">
          <Select
            value={next}
            onChange={(event) => {
              const parsed = tenantSubscriptionStatusSchema.safeParse(
                event.target.value,
              );
              if (parsed.success) setNext(parsed.data);
            }}
          >
            {tenantSubscriptionStatuses
              .filter((status) => status !== current)
              .map((status) => (
                <option key={status} value={status}>
                  {statusT(status)}
                </option>
              ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          onClick={() => setConfirming(true)}
          disabled={next === current}
        >
          {t('change')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        title={t('confirmTitle', { status: statusT(next) })}
        confirmLabel={pending ? t('changing') : t('confirm')}
        cancelLabel={t('cancel')}
        tone={next === 'cancelled' ? 'destructive' : 'primary'}
        pending={pending}
        onConfirm={apply}
        onCancel={() => setConfirming(false)}
      >
        {t(`effects.${next}`)}
      </ConfirmDialog>
    </div>
  );
}
