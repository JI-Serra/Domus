import { gateTypeScale, typeRoles, typeScale } from '@domus/ui-tokens';
import type { TypeRole } from '@domus/ui-tokens';
import { getTranslations } from 'next-intl/server';
import { Section, Specimen } from './section';

// Full class names so Tailwind can detect them.
const roleClass: Record<TypeRole, string> = {
  'app-display': 'text-app-display',
  'app-title': 'text-app-title',
  'app-heading': 'text-app-heading',
  'app-subheading': 'text-app-subheading',
  'app-body': 'text-app-body',
  'app-body-dense': 'text-app-body-dense',
  'app-caption': 'text-app-caption',
  'app-micro': 'text-app-micro',
  'app-result': 'text-app-result',
  'app-reason': 'text-app-reason',
  'app-rule': 'text-app-rule',
};

const spec = (style: {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
}) => `${style.fontSize} / ${style.lineHeight} · ${style.fontWeight}`;

export async function TypographySection() {
  const t = await getTranslations('design.typography');
  return (
    <Section id="typography" title={t('title')} info={t('info')}>
      <div className="flex flex-col gap-8">
        <Specimen title={t('familyTitle')}>
          <p className="text-app-body">{t('familySample')}</p>
          <p className="tnum text-app-body">{t('numbersSample')}</p>
        </Specimen>

        <Specimen title={t('scaleTitle')}>
          <ul className="flex flex-col gap-4">
            {typeRoles.map((role) => (
              <li
                key={role}
                className="grid gap-1 rounded-card-dense bg-surface-1 p-4 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-baseline lg:gap-6"
              >
                <div className="flex flex-col text-app-caption text-text-secondary">
                  <code className="font-semibold text-text-primary">
                    {role}
                  </code>
                  <span className="tnum">
                    {t('regular', { spec: spec(typeScale[role]) })}
                  </span>
                  <span className="tnum">
                    {t('gate', { spec: spec(gateTypeScale[role]) })}
                  </span>
                </div>
                <p className={`${roleClass[role]} min-w-0 break-words`}>
                  {t(`samples.${role}`)}
                </p>
              </li>
            ))}
          </ul>
        </Specimen>
      </div>
    </Section>
  );
}
