'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';

/** Role values from GLOSSARY.md (`membership_role`). */
export type MembershipRole =
  | 'platform_admin'
  | 'tenant_admin'
  | 'guard'
  | 'unit_holder'
  | 'household_member';

/**
 * What the shell needs to know about the membership the user is currently acting as: tenant + role + unit
 * (spec §6.1). Field names follow the DB naming rules so the auth task can build it straight from `membership`
 * rows joined with `tenant` and `unit`.
 */
export interface ActiveContext {
  /** `membership.membership_id`: identifies the (tenant, role, unit) combination. */
  membership_id: string;
  tenant_id: string;
  tenant_name: string;
  /** IANA time zone of the tenant, passed to `@domus/domain/format`. */
  tenant_time_zone: string;
  membership_role: MembershipRole;
  /** Null for roles that are not tied to a unit (administrators, guards, platform admins). */
  unit_id: string | null;
  unit_name: string | null;
}

/**
 * The contract between the shell and whoever knows the user's memberships. The mock provider implements it with
 * fixtures; the auth task replaces the provider (not the consumers) with real memberships.
 */
export interface ActiveContextState {
  contexts: readonly ActiveContext[];
  active: ActiveContext;
  switchContext: (membership_id: string) => void;
}

const ActiveContextReact = createContext<ActiveContextState | null>(null);

export interface ActiveContextProviderProps {
  /** Every membership the user can act as. Must contain at least one. */
  contexts: readonly ActiveContext[];
  /** Membership active on first render; defaults to the first context. */
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

  const [activeId, setActiveId] = useState(
    contexts.some((context) => context.membership_id === initialMembershipId)
      ? initialMembershipId
      : first.membership_id,
  );

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
