import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { MockActiveContextProvider } from '@/components/shell/mock-active-context';

// Swap `MockActiveContextProvider` for the real memberships provider when authentication lands (M00-F04).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <MockActiveContextProvider>
      <AppShell>{children}</AppShell>
    </MockActiveContextProvider>
  );
}
