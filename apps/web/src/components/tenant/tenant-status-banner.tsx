'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { InfoButton } from '@/components/ui/info-button';
import { useTenantStatus } from './tenant-status';

/**
 * Compact persistent notice while the active tenant is suspended (M01-F02): read-only for everybody, while the
 * guard console keeps validating accesses. State is carried by icon and text, not by color alone.
 */
export function TenantStatusBanner() {
  const t = useTranslations('tenantStatus.suspended');
  if (useTenantStatus() !== 'suspended') return null;
  return (
    <div
      role="status"
      className="flex min-h-(--control-height) items-center gap-2 bg-warning-bg px-4 text-app-body-dense font-semibold text-warning lg:px-6"
    >
      <Lock aria-hidden="true" className="size-5 shrink-0" strokeWidth={2} />
      <span className="min-w-0 flex-1">{t('banner')}</span>
      <InfoButton label={t('infoLabel')} className="text-text-primary">
        {t('info')}
      </InfoButton>
    </div>
  );
}
