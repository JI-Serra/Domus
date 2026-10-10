import type { ReactNode } from 'react';

/** Page title (`app-title`) with an optional supporting sentence. */
export function PageHeader({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-2">
      <h1 className="text-app-title">{title}</h1>
      {description ? (
        <p className="max-w-prose text-text-secondary">{description}</p>
      ) : null}
    </header>
  );
}
