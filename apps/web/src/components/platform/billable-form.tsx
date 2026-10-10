'use client';

import { useTranslations } from 'next-intl';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { InfoButton } from '@/components/ui/info-button';
import { Switch } from '@/components/ui/switch';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { PlatformFormState } from '@/lib/platform/form-state';

const UNIT_STATUSES = ['occupied', 'under_construction', 'vacant'] as const;

/**
 * D20 / M01-F03: which unit statuses count as billable, and the resulting count of billable units of the barrio
 * (computed by the database from the criteria, each unit's own override and archival).
 */
export function BillableForm({
  selected,
  count,
  action,
}: {
  selected: readonly string[];
  /** Billable units of the barrio now; null when it could not be read. */
  count: number | null;

  action: (
    previous: PlatformFormState,
    formData: FormData,
  ) => Promise<PlatformFormState>;
}) {
  const t = useTranslations('platform.tenants.billable');
  const unitT = useTranslations('unitStatus');
  const errorsT = useTranslations('platform.tenants.errors');
  const notices = useTranslations('platform.tenants.notices');
  const { state, onSubmit, pending } = useSubmitAction(action);
  const errorKey =
    state.status === 'error' ? (state.formError ?? 'unknown') : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="flex items-baseline gap-3">
        <span className="text-app-subheading">{t('count')}</span>
        <span
          data-testid="billable-count"
          className="text-app-title tabular-nums"
        >
          {count ?? t('countUnavailable')}
        </span>
      </p>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 flex items-center gap-1 text-app-subheading">
          {t('legend')}
          <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
        </legend>
        {UNIT_STATUSES.map((status) => (
          <Switch
            key={status}
            name="unit_status"
            value={status}
            label={unitT(status)}
            defaultChecked={selected.includes(status)}
          />
        ))}
      </fieldset>
      {errorKey ? (
        <AuthNotice tone="error">
          {errorsT.has(errorKey as 'unknown')
            ? errorsT(errorKey as 'unknown')
            : errorsT('unknown')}
        </AuthNotice>
      ) : null}
      {state.status === 'success' ? (
        <AuthNotice tone="success">{notices('saved')}</AuthNotice>
      ) : null}
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
