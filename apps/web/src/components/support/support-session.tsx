'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** What the browser may know about the running support session: never the token. */
export interface SupportSessionInfo {
  sessionId: string;
  targetName: string;
  tenantName: string;
  expiresAt: string;
  serverNow: string;
}

const SupportSessionReact = createContext<SupportSessionInfo | null>(null);

/** Feeds the shell with the support session read on the server (null when the admin is acting as themselves). */
export function SupportSessionProvider({
  value,
  children,
}: {
  value: SupportSessionInfo | null;
  children: ReactNode;
}) {
  return (
    <SupportSessionReact.Provider value={value}>
      {children}
    </SupportSessionReact.Provider>
  );
}

/** The running support session, or null. Controls that would change an account or leave the session hide on it. */
export function useSupportSession(): SupportSessionInfo | null {
  return useContext(SupportSessionReact);
}
