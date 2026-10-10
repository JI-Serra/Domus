import { colorTokenNames, colors } from '@domus/ui-tokens';
import type { ColorToken, ThemeName } from '@domus/ui-tokens';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { Section } from './section';

const themeOrder: ThemeName[] = ['light', 'dark', 'gate-light', 'gate-dark'];

export async function ColorsSection() {
  const t = await getTranslations('design.colors');
  return (
    <Section id="colors" title={t('title')} description={t('description')}>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {colorTokenNames.map((token: ColorToken) => (
          <li key={token}>
            <Card density="dense" className="h-full">
              <p className="tnum text-app-body-dense font-semibold">{`--color-${token}`}</p>
              <div
                aria-hidden="true"
                className="mt-3 h-10 rounded-input"
                style={{ backgroundColor: `var(--color-${token})` }}
              />
              <p className="mt-1 text-app-caption text-text-secondary">
                {t('liveSwatch')}
              </p>
              <dl className="mt-3 grid gap-2">
                {themeOrder.map((theme) => (
                  <div key={theme} className="flex items-center gap-3">
                    <dt className="sr-only">{t(`themes.${theme}`)}</dt>
                    <span
                      aria-hidden="true"
                      className="size-6 shrink-0 rounded-full border border-hairline"
                      style={{ backgroundColor: colors[theme][token] }}
                    />
                    <dd className="text-app-caption">
                      <span className="text-text-secondary">
                        {t(`themes.${theme}`)}
                      </span>{' '}
                      <span className="tnum">{colors[theme][token]}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          </li>
        ))}
      </ul>
    </Section>
  );
}
