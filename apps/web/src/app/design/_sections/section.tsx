import type { ReactNode } from 'react';

/** Titled block of the design page with an anchor for the in-page index. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      id={id}
      className="scroll-mt-24 py-8"
    >
      <h2 id={`${id}-title`} className="text-app-title">
        {title}
      </h2>
      {description ? (
        <p className="mt-2 max-w-prose text-text-secondary">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** Small labelled sub-block inside a section. */
export function Specimen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-app-subheading">{title}</h3>
      {children}
    </div>
  );
}
