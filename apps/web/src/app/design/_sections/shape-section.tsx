import { layout, radius, shadow, spacingScale, touch } from '@domus/ui-tokens';
import { getTranslations } from 'next-intl/server';
import { Section, Specimen } from './section';

export async function ShapeSection() {
  const t = await getTranslations('design.shape');
  return (
    <Section id="shape" title={t('title')} info={t('info')}>
      <div className="grid gap-8 lg:grid-cols-2">
        <Specimen title={t('spacingTitle')}>
          <ul className="flex flex-col gap-2">
            {spacingScale.map((value) => (
              <li key={value} className="flex items-center gap-3">
                <span className="tnum w-14 shrink-0 text-app-caption text-text-secondary">{`${value} px`}</span>
                <span
                  aria-hidden="true"
                  className="h-3 max-w-full rounded-full bg-accent"
                  style={{ width: value }}
                />
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title={t('radiusTitle')}>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {Object.entries(radius).map(([name, value]) => (
              <li key={name} className="flex flex-col gap-2">
                <span
                  aria-hidden="true"
                  className="h-16 w-full max-w-24 border-2 border-text-primary bg-surface-1"
                  style={{ borderRadius: Math.min(value, 32) }}
                />
                <span className="text-app-caption">
                  <code className="font-semibold">{name}</code>
                  <span className="tnum block text-text-secondary">{`${value} px`}</span>
                </span>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title={t('touchTitle')}>
          <ul className="flex flex-col gap-3">
            {Object.entries(touch).map(([name, value]) => (
              <li key={name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="w-24 shrink-0 rounded-input bg-accent"
                  style={{ height: value }}
                />
                <span className="text-app-caption">
                  <code className="font-semibold">{name}</code>
                  <span className="tnum block text-text-secondary">{`${value} px`}</span>
                </span>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title={t('layoutTitle')}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-app-body-dense">
            {Object.entries(layout).map(([name, value]) => (
              <div key={name} className="contents">
                <dt>
                  <code>{name}</code>
                </dt>
                <dd className="tnum text-text-secondary">{`${value} px`}</dd>
              </div>
            ))}
          </dl>
          <div
            aria-hidden="true"
            className="h-16 max-w-xs rounded-card bg-surface-0"
            style={{ boxShadow: shadow.modal }}
          />
        </Specimen>
      </div>
    </Section>
  );
}
