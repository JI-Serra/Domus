'use client';

import { formatDateTime } from '@domus/domain/format';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { useActiveContext } from './active-context';

/**
 * Placeholder home content: shows the active context and a sample instant formatted in the tenant's time zone
 * (UTC in the database, tenant zone on screen).
 */
export function ContextSummary({ sampleInstant }: { sampleInstant: string }) {
  const t = useTranslations('home');
  const roles = useTranslations('roles');
  const { active } = useActiveContext();

  return (
    <Card>
      <h2 className="mb-4 text-app-heading">{t('contextTitle')}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-app-caption text-text-secondary">
            {t('tenant')}
          </dt>
          <dd className="text-app-subheading">{active.tenant_name}</dd>
        </div>
        <div>
          <dt className="text-app-caption text-text-secondary">{t('role')}</dt>
          <dd className="text-app-subheading">
            {roles(active.membership_role)}
          </dd>
        </div>
        <div>
          <dt className="text-app-caption text-text-secondary">{t('unit')}</dt>
          <dd className="text-app-subheading">
            {active.unit_name ?? t('noUnit')}
          </dd>
        </div>
        <div>
          <dt className="text-app-caption text-text-secondary">
            {t('sampleTime', { zone: active.tenant_time_zone })}
          </dt>
          <dd className="tnum text-app-subheading">
            {formatDateTime(sampleInstant, active.tenant_time_zone)}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
