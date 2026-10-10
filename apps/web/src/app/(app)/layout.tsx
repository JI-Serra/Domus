import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { NoMemberships } from '@/components/shell/no-memberships';
import { ServerActiveContextProvider } from '@/components/shell/server-active-context';
import { getRequestContext } from '@/lib/context/request-context';

/**
 * Everything in the `(app)` group needs a session and a validated active context. `proxy.ts` already redirects
 * visitors; this re-checks on the server so the group stays protected if the proxy matcher ever changes.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const request = await getRequestContext();
  if (!request) redirect('/login');

  const { active, options } = request.resolved;
  if (!active) return <NoMemberships />;

  return (
    <ServerActiveContextProvider
      contexts={options}
      activeMembershipId={active.membership_id}
    >
      <AppShell>{children}</AppShell>
    </ServerActiveContextProvider>
  );
}
