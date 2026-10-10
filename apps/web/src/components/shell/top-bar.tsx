import { AppearanceMenu } from './appearance-menu';
import { ContextSelector } from './context-selector';
import { LogoutButton } from './logout-button';

/** Sticky top bar: the active context is always visible and switchable here, on every viewport. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex min-h-(--top-bar-height) items-center gap-2 bg-surface-1 px-4 py-2 lg:px-6">
      <ContextSelector className="flex-1" />
      <AppearanceMenu />
      <LogoutButton compact />
    </header>
  );
}
