import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import { useTranslations } from 'next-intl';
import { StatusBadge } from '@/components/ui/badge';
import type { StatusTone } from '@/components/ui/badge';

const TONES: Record<TenantSubscriptionStatus, StatusTone> = {
  pilot: 'info',
  active: 'success',
  suspended: 'warning',
  cancelled: 'danger',
};

/** Subscription status as icon + text, never color alone (M01-F02). */
export function SubscriptionBadge({
  status,
}: {
  status: TenantSubscriptionStatus;
}) {
  const t = useTranslations('platform.tenants.status');
  return <StatusBadge status={TONES[status]}>{t(status)}</StatusBadge>;
}
