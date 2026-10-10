import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/empty-state';
import type { CancelledTenant } from '@/lib/tenant/cancelled';
import { LogoutButton } from './logout-button';

/**
 * Shown to a signed-in user whose only memberships are in cancelled barrios (M01-F02): the name of each barrio and
 * the way out, instead of the generic "no barrio yet" page.
 */
export function CancelledTenants({
  tenants,
}: {
  tenants: readonly CancelledTenant[];
}) {
  const t = useTranslations('tenantStatus.cancelledUser');
  const brand = useTranslations('common');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <p className="text-app-heading">{brand('appName')}</p>
      <EmptyState
        icon={Ban}
        title={t('title')}
        description={tenants.map((tenant) => tenant.tenant_name).join(', ')}
        action={<LogoutButton />}
      />
    </main>
  );
}
