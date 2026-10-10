import {
  formatCurrencyArs,
  formatDate,
  formatDateTime,
} from '@domus/domain/format';
import { getTranslations } from 'next-intl/server';
import { Section } from './section';

const INSTANT = '2026-10-10T02:30:00Z';

export async function FormatsSection() {
  const t = await getTranslations('design.formats');
  const rows: { label: string; value: string }[] = [
    { label: t('currency'), value: formatCurrencyArs(1234.56) },
    { label: t('currencyLarge'), value: formatCurrencyArs(1250000) },
    { label: t('utc'), value: INSTANT },
    { label: t('date'), value: formatDate(INSTANT) },
    { label: t('dateTime'), value: formatDateTime(INSTANT) },
    {
      label: t('dateTimeOtherZone'),
      value: formatDateTime(INSTANT, 'America/Argentina/Buenos_Aires'),
    },
  ];
  return (
    <Section id="formats" title={t('title')} info={t('info')}>
      <dl className="grid max-w-2xl grid-cols-[1fr_auto] gap-x-6 gap-y-2 rounded-card-dense bg-surface-1 p-4">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-app-body-dense text-text-secondary">
              {row.label}
            </dt>
            <dd className="tnum text-right text-app-body-dense font-semibold">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
