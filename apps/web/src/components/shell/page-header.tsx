import type { ReactNode } from 'react';

/**
 * Page title (`app-title`) with an optional primary action on the right. Help text belongs behind an `InfoButton`,
 * not under the title (DESIGN.md §A.9).
 */
export function PageHeader({
  title,
  action,
}: {
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <h1 className="text-app-title">{title}</h1>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
