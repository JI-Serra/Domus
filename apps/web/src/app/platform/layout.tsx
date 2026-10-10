import { PLATFORM_CONTEXT_ID } from '@domus/domain/context';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ServerShell } from '@/components/shell/server-shell';
import { challengeUrlFor, enrollmentUrlFor } from '@/lib/auth/mfa';
import { getRequestContext } from '@/lib/context/request-context';

/**
 * The platform area (spec §6, S8): only for platform admins, only at `aal2`. `proxy.ts` already sends everybody else
 * away; this checks again on the server, from the verified session, so the area stays closed if the proxy matcher
 * ever changes. The database independently requires `aal2` for every platform operation.
 *
 * - platform admin without a factor → enrollment; with a factor but still `aal1` → the challenge;
 * - anybody else (including `aal2` users who are not platform admins) → 404, which does not confirm the area exists.
 */
export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  const request = await getRequestContext();
  if (!request) redirect('/login');

  const { identity, resolved } = request;
  if (resolved.platformMfaStep === 'challenge')
    redirect(challengeUrlFor('/platform'));
  if (resolved.platformMfaStep === 'enroll')
    redirect(enrollmentUrlFor('/platform'));

  const platform = resolved.options.find(
    (option) => option.membership_id === PLATFORM_CONTEXT_ID,
  );
  if (identity.aal !== 'aal2' || !platform) notFound();

  return (
    <ServerShell contexts={resolved.options} active={platform}>
      {children}
    </ServerShell>
  );
}
