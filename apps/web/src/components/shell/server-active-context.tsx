'use client';

import { useRouter } from 'next/navigation';
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
  children,
}: {
  contexts: readonly ActiveContext[];
  activeMembershipId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const onSwitch = useCallback(
    (context: ActiveContext) => {
      startTransition(async () => {
        await switchContextAction(context.membership_id);
        router.refresh();
      });
    },
    [router],
  );

  return (
    <ActiveContextProvider
      contexts={contexts}
      initialMembershipId={activeMembershipId}
      onSwitch={onSwitch}
    >
      {children}
    </ActiveContextProvider>
  );
}
