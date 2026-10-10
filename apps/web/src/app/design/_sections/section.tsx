import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { InfoButton } from '@/components/ui/info-button';

/** Titled block of the design page with an anchor for the in-page index. */
export async function Section({
  id,
  title,
  info,
  children,
}: {
  id: string;
  title: string;
  /** Help for the section; shown behind an info button next to the title, never as permanent text. */
  info?: string;
  children: ReactNode;
}) {
  const t = await getTranslations('common');
  return (
    <section
      aria-labelledby={`${id}-title`}
      id={id}
      className="scroll-mt-24 py-8"
    >
      <div className="flex items-center gap-1">
        <h2 id={`${id}-title`} className="text-app-title">
          {title}
        </h2>
        {info ? (
          <InfoButton label={t('moreInfo', { topic: title })}>
            {info}
          </InfoButton>
        ) : null}
      </div>
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
