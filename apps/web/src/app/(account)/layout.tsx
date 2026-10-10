import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { LogoutButton } from '@/components/shell/logout-button';
import { ServerShell } from '@/components/shell/server-shell';
import { getRequestContext } from '@/lib/context/request-context';

/**
 * Account pages (security). They are reachable by anybody signed in, also by a user with nothing to act as yet, such
 * as a platform admin who has to enroll a second factor before the platform area opens: with a context they get the
 * app shell, without one a bare frame with the way out.
 */
export default async function AccountLayout({
  children,
}: {
  children: ReactNode;
}) {
  const request = await getRequestContext();
  if (!request) redirect('/login');

  const { active, options, platformMfaStep } = request.resolved;
  if (active)
    return (
      <ServerShell
        contexts={options}
        active={active}
        platformMfaStep={platformMfaStep}
      >
        {children}
      </ServerShell>
    );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--container-content) flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="flex items-center justify-between gap-4">
        <Logo className="h-8" />
        <LogoutButton compact />
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
