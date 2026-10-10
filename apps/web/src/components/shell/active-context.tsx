'use client';

import type { ActiveContext } from '@domus/domain/context';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

export type { ActiveContext, MembershipRole } from '@domus/domain/context';

/**
 * The contract between the shell and whoever knows the user's memberships. The server resolves and validates the
 * contexts (`@domus/domain/context`); the shell only renders them and asks to switch.
 */
export interface ActiveContextState {
  contexts: readonly ActiveContext[];
  active: ActiveContext;
  switchContext: (membership_id: string) => void;
}

const ActiveContextReact = createContext<ActiveContextState | null>(null);

export interface ActiveContextProviderProps {
  /** Every context the user can act as. Must contain at least one. */
  contexts: readonly ActiveContext[];
  /**
   * Context active on first render; defaults to the first context. When this value changes (the server validated
   * a new choice) the provider follows it.
   */
  initialMembershipId?: string;
  /** Called after the user switches context, e.g. to persist the choice server-side. */
  onSwitch?: (context: ActiveContext) => void;
  children: ReactNode;
}

export function ActiveContextProvider({
  contexts,
  initialMembershipId,
  onSwitch,
  children,
}: ActiveContextProviderProps) {
  const first = contexts[0];
  if (!first)
    throw new Error('ActiveContextProvider needs at least one context');

  const validId = (id: string | undefined) =>
    contexts.some((context) => context.membership_id === id)
      ? id
      : first.membership_id;

  const [activeId, setActiveId] = useState(validId(initialMembershipId));
  // Follow the server: when the validated initial context changes, adopt it (adjusting state while rendering).
  const [seenInitialId, setSeenInitialId] = useState(initialMembershipId);
  if (seenInitialId !== initialMembershipId) {
    setSeenInitialId(initialMembershipId);
    setActiveId(validId(initialMembershipId));
  }

  const switchContext = useCallback(
    (membership_id: string) => {
      const next = contexts.find(
        (context) => context.membership_id === membership_id,
      );
      if (!next) return;
      setActiveId(next.membership_id);
      onSwitch?.(next);
    },
    [contexts, onSwitch],
  );

  const value = useMemo<ActiveContextState>(
    () => ({
      contexts,
      active:
        contexts.find((context) => context.membership_id === activeId) ?? first,
      switchContext,
    }),
    [contexts, activeId, first, switchContext],
  );

  return (
    <ActiveContextReact.Provider value={value}>
      {children}
    </ActiveContextReact.Provider>
  );
}

export function useActiveContext(): ActiveContextState {
  const state = useContext(ActiveContextReact);
  if (!state)
    throw new Error(
      'useActiveContext must be used inside an ActiveContextProvider',
    );
  return state;
}
