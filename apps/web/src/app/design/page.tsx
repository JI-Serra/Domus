import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ThemeControls } from '@/components/theme/theme-controls';
import { InfoButton } from '@/components/ui/info-button';
import { BrandSection } from './_sections/brand-section';
import {
  BadgesSection,
  ButtonsSection,
  CardsSection,
  InputsSection,
} from './_sections/components-section';
import { ColorsSection } from './_sections/colors-section';
import { FormatsSection } from './_sections/formats-section';
import { SemaphoreSection } from './_sections/semaphore-section';
import { ShapeSection } from './_sections/shape-section';
import { TypographySection } from './_sections/typography-section';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('design');
  return { title: t('metaTitle') };
}

const sections = [
  'brand',
  'colors',
  'typography',
  'shape',
  'buttons',
  'inputs',
  'badges',
  'cards',
  'semaphore',
  'formats',
] as const;

/** Internal reference page (M00-F02). Not linked from the product navigation and without authentication for now. */
export default async function DesignPage() {
  const t = await getTranslations('design');
  return (
    <div className="mx-auto w-full max-w-(--container-content) px-4 pt-6 pb-16 lg:px-6">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-button focus:bg-accent focus:px-5 focus:py-3 focus:text-on-accent"
      >
        {t('skipToContent')}
      </a>
      <header className="flex flex-col gap-6 pb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex max-w-prose flex-col gap-2">
          <Link
            href="/"
            className="text-app-body-dense text-info underline-offset-4 hover:underline"
          >
            {t('backHome')}
          </Link>
          <div className="flex items-center gap-1">
            <h1 className="text-app-display">{t('title')}</h1>
            <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
          </div>
        </div>
        <div className="w-full rounded-card-dense bg-surface-1 p-4 lg:max-w-sm">
          <ThemeControls />
        </div>
      </header>

      <nav aria-label={t('indexLabel')} className="pb-4">
        <ul className="flex flex-wrap gap-2">
          {sections.map((id) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-(--control-height) items-center rounded-button bg-surface-1 px-4 text-app-body-dense hover:bg-surface-2"
              >
                {t(`index.${id}`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main id="content">
        <BrandSection />
        <ColorsSection />
        <TypographySection />
        <ShapeSection />
        <ButtonsSection />
        <InputsSection />
        <BadgesSection />
        <CardsSection />
        <SemaphoreSection />
        <FormatsSection />
      </main>
    </div>
  );
}
