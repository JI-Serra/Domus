import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

/** Replaces the content of every tenant page once the subscription is cancelled (M01-F02). */
export function TenantCancelled() {
  const t = useTranslations('tenantStatus.cancelled');
  return (
    <Card>
      <EmptyState
        icon={Ban}
        title={t('title')}
        description={t('description')}
        align="start"
      />
    </Card>
  );
}
