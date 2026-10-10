import { getTranslations } from 'next-intl/server';
import { ContextSummary } from '@/components/shell/context-summary';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';

// A fixed instant keeps the page static; real pages format `*_at` columns from the database.
const SAMPLE_INSTANT = '2026-10-09T18:30:00Z';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="flex flex-col items-start gap-6">
        <ContextSummary sampleInstant={SAMPLE_INSTANT} />
        <ButtonLink href="/design" variant="secondary">
          {t('designLink')}
        </ButtonLink>
      </div>
    </>
  );
}
