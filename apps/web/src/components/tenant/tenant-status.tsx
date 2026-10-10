'use client';

import { isTenantWritable } from '@domus/domain/tenant/subscription-status';
import type { TenantSubscriptionStatus } from '@domus/domain/tenant/subscription-status';
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** `null` status: the active context has no tenant (platform area), so no subscription applies. */
const TenantStatusReact = createContext<{
  status: TenantSubscriptionStatus | null;
} | null>(null);

/** Feeds the subscription status of the active tenant (read on the server) to the shell and to write controls. */
export function TenantStatusProvider({
  status,
  children,
}: {
  status: TenantSubscriptionStatus | null;
  children: ReactNode;
}) {
  return (
    <TenantStatusReact.Provider value={{ status }}>
      {children}
    </TenantStatusReact.Provider>
  );
}

export function useTenantStatus(): TenantSubscriptionStatus | null {
  const state = useContext(TenantStatusReact);
  if (!state)
    throw new Error(
      'useTenantStatus must be used inside a TenantStatusProvider',
    );
  return state.status;
}

/**
 * True when the active tenant allows write actions (pilot or active). Later modules disable their write controls
 * with it; the server enforces the same rule with `assertTenantWritable()`, because hiding a button is not a control.
 */
export function useTenantWritable(): boolean {
  const status = useTenantStatus();
  return status === null || isTenantWritable(status);
}
