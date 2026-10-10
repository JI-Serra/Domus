'use client';

import { PLATFORM_CONTEXT_ID } from '@domus/domain/context';
import type { MfaStep } from '@domus/domain/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useTransition } from 'react';
import type { ReactNode } from 'react';
import { switchContextAction } from '@/app/(app)/actions';
import { ActiveContextProvider } from './active-context';
import type { ActiveContext } from './active-context';

/**
 * Feeds the shell with the contexts the server already validated, and persists a switch through a server action.
 * The action re-validates the choice against the user's active memberships; the client never decides.
 */
export function ServerActiveContextProvider({
  contexts,
  activeMembershipId,
  platformMfaStep = null,
  children,
}: {
  contexts: readonly ActiveContext[];
  activeMembershipId: string;
  platformMfaStep?: MfaStep | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const onSwitch = useCallback(
    (context: ActiveContext) => {
      startTransition(async () => {
        await switchContextAction(context.membership_id);
        // The platform area and the tenant area are different places: switching between them moves there.
        const inPlatform =
          pathname === '/platform' || pathname.startsWith('/platform/');
        if (context.membership_id === PLATFORM_CONTEXT_ID)
          router.push('/platform');
        else if (inPlatform) router.push('/');
        else router.refresh();
      });
    },
    [router, pathname],
  );

  return (
    <ActiveContextProvider
      contexts={contexts}
      initialMembershipId={activeMembershipId}
      onSwitch={onSwitch}
      platformMfaStep={platformMfaStep}
    >
      {children}
    </ActiveContextProvider>
  );
}
