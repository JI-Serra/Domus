'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { useActiveContext } from './active-context';
import { useContextTitle } from './context-selector';

/** Placeholder home content: the active tenant, role and unit. */
export function ContextSummary() {
  const t = useTranslations('home');
  const roles = useTranslations('roles');
  const { active } = useActiveContext();
  const title = useContextTitle();

  return (
    <Card>
      <h2 className="mb-4 text-app-heading">{t('contextTitle')}</h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-app-caption text-text-secondary">
            {t('tenant')}
          </dt>
          <dd className="text-app-subheading">{title(active)}</dd>
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
      </dl>
    </Card>
  );
}
