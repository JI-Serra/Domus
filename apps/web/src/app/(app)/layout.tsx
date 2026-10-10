import { PLATFORM_CONTEXT_ID } from '@domus/domain/context';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { CancelledTenants } from '@/components/shell/cancelled-tenants';
import { NoMemberships } from '@/components/shell/no-memberships';
import { ServerShell } from '@/components/shell/server-shell';
import { TenantCancelled } from '@/components/tenant/tenant-cancelled';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';
import { loadCancelledTenants } from '@/lib/tenant/cancelled';
import { getTenantSubscriptionStatus } from '@/lib/tenant/status';

/**
 * Everything in the `(app)` group needs a session and a validated active context. `proxy.ts` already redirects
 * visitors; this re-checks on the server so the group stays protected if the proxy matcher ever changes.
 *
 * Tenant pages are replaced by a blocking page once the tenant's subscription is cancelled (M01-F02); the shell
 * stays so the user can switch to another barrio. (Today the database already leaves cancelled barrios out of
 * `member_tenant_ids()`, so such a membership does not resolve and the user lands on the no-barrio page; this guard
 * keeps the block if that policy ever changes. A user with no other barrio gets the "dado de baja" page, fed by
 * `current_user_cancelled_tenants()`.) The platform context lives in `/platform`, not here.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const request = await getRequestContext();
  if (!request) redirect('/login');

  const { active, options, platformMfaStep } = request.resolved;
  if (!active) {
    // A platform admin below aal2 has nothing here: the platform area leads them to enroll or answer the challenge.
    if (platformMfaStep) redirect('/platform');
    // Cancelled barrios are invisible to RLS, so the generic page would be misleading: say what happened.
    const cancelled = await loadCancelledTenants(await createRequestClient());
    return cancelled.length > 0 ? (
      <CancelledTenants tenants={cancelled} />
    ) : (
      <NoMemberships />
    );
  }
  if (active.membership_id === PLATFORM_CONTEXT_ID) redirect('/platform');

  const status = active.tenant_id
    ? await getTenantSubscriptionStatus(active.tenant_id)
    : null;
  return (
    <ServerShell
      contexts={options}
      active={active}
      platformMfaStep={platformMfaStep}
    >
      {status === 'cancelled' ? <TenantCancelled /> : children}
    </ServerShell>
  );
}
