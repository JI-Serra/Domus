import { getTranslations } from 'next-intl/server';
import { ContextSummary } from '@/components/shell/context-summary';
import { SectionShortcuts } from '@/components/shell/section-shortcuts';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';

export default async function HomePage() {
  const t = await getTranslations('home');
  return (
    <>
      <PageHeader title={t('title')} />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <ContextSummary />
        <SectionShortcuts />
      </div>
      <ButtonLink href="/design" variant="secondary" className="mt-6">
        {t('designLink')}
      </ButtonLink>
    </>
  );
}
