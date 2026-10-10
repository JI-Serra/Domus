import type { MfaStep } from '@domus/domain/auth';
import type { ActiveContext } from '@domus/domain/context';
import type { ReactNode } from 'react';
import { SupportSessionProvider } from '@/components/support/support-session';
import { TenantStatusProvider } from '@/components/tenant/tenant-status';
import { getSupportBanner } from '@/lib/support/banner';
import { getAdminPermissions } from '@/lib/registry/permissions';
import { getTenantSubscriptionStatus } from '@/lib/tenant/status';
import { AdminPermissionsProvider } from './admin-permissions';
import { AppShell } from './app-shell';
import { ServerActiveContextProvider } from './server-active-context';

/**
 * The app shell fed by server-validated data: the contexts the user may act as, the active one, and the
 * subscription status of the active tenant (read through the user's RLS client). Shared by the tenant area, the
 * account pages and the platform area.
 */
export async function ServerShell({
  contexts,
  active,
  platformMfaStep = null,
  children,
}: {
  contexts: readonly ActiveContext[];
  active: ActiveContext;
  platformMfaStep?: MfaStep | null;
  children: ReactNode;
}) {
  const status = active.tenant_id
    ? await getTenantSubscriptionStatus(active.tenant_id)
    : null;
  const support = await getSupportBanner();
  const permissions = await getAdminPermissions();
  return (
    <ServerActiveContextProvider
      contexts={contexts}
      activeMembershipId={active.membership_id}
      platformMfaStep={platformMfaStep}
    >
      <TenantStatusProvider status={status}>
        <SupportSessionProvider value={support}>
          <AdminPermissionsProvider permissions={permissions}>
            <AppShell>{children}</AppShell>
          </AdminPermissionsProvider>
        </SupportSessionProvider>
      </TenantStatusProvider>
    </ServerActiveContextProvider>
  );
}
