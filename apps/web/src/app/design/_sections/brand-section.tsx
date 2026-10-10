import { getTranslations } from 'next-intl/server';
import { Emblem } from '@/components/brand/emblem';
import { Logo } from '@/components/brand/logo';
import { Section, Specimen } from './section';

const EMBLEM_HEIGHTS = ['h-6', 'h-8', 'h-12', 'h-24'] as const;
const APP_ICONS = [
  { src: '/icons/icon-192.png', size: 96, key: 'any' },
  { src: '/icons/icon-maskable-512.png', size: 96, key: 'maskable' },
  { src: '/apple-icon.png', size: 96, key: 'apple' },
] as const;

/** Brand identity (M00-F02): emblem and wordmark in every surface they appear on, and the app icons. */
export async function BrandSection() {
  const t = await getTranslations('design.brand');
  return (
    <Section id="brand" title={t('title')} info={t('info')}>
      <div className="grid gap-8 lg:grid-cols-2">
        <Specimen title={t('emblemTitle')}>
          <div className="flex flex-wrap items-end gap-6 rounded-card-dense bg-surface-1 p-6">
            {EMBLEM_HEIGHTS.map((height) => (
              <Emblem key={height} className={height} />
            ))}
          </div>
        </Specimen>

        <Specimen title={t('logoTitle')}>
          <div className="flex flex-col items-start gap-6 rounded-card-dense bg-surface-1 p-6">
            <Logo className="h-6" />
            <Logo className="h-10" />
            <Logo className="h-16" />
          </div>
        </Specimen>

        <Specimen title={t('surfacesTitle')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 rounded-card-dense bg-surface-0 p-6 ring-1 ring-hairline">
              <Emblem className="h-12" />
              <Logo className="h-10" />
            </div>
            <div className="flex items-center gap-4 rounded-card-dense bg-text-primary p-6 text-surface-0">
              <Emblem className="h-12" />
              <Logo className="h-10" />
            </div>
          </div>
        </Specimen>

        <Specimen title={t('iconsTitle')}>
          <ul className="flex flex-wrap gap-6">
            {APP_ICONS.map(({ src, size, key }) => (
              <li key={key} className="flex flex-col gap-2">
                {/* Static brand files served from /public; shown at their natural resolution. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={t(`icons.${key}`)}
                  width={size}
                  height={size}
                  className="rounded-card-dense ring-1 ring-hairline"
                />
                <span className="text-app-caption text-text-secondary">
                  {t(`icons.${key}`)}
                </span>
              </li>
            ))}
          </ul>
        </Specimen>
      </div>
    </Section>
  );
}
