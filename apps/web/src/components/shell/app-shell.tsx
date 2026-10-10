import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { TabBar } from './tab-bar';
import { TopBar } from './top-bar';

/**
 * Base layout (M00-F03): sidebar from 1024 px, bottom tab bar below it, and a top bar with the active context.
 * Must be rendered inside an `ActiveContextProvider`.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-button focus:bg-accent focus:px-5 focus:py-3 focus:text-on-accent"
      >
        {t('skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <TopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-(--container-content) flex-1 px-4 pt-6 pb-[calc(max(var(--tab-bar-height),var(--control-height))+env(safe-area-inset-bottom)+2rem)] lg:px-6 lg:pb-12"
        >
          {children}
        </main>
      </div>
      <TabBar />
    </div>
  );
}
