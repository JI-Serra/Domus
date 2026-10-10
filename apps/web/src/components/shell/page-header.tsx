import type { ReactNode } from 'react';

/** Page title (`app-title`). Help text belongs behind an `InfoButton`, not under the title (DESIGN.md §A.9). */
export function PageHeader({ title }: { title: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-app-title">{title}</h1>
    </header>
  );
}
