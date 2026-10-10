import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ImportWizard } from '@/components/registry/import-wizard';
import { PageHeader } from '@/components/shell/page-header';
import { requireAdminScope } from '@/lib/registry/guard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.import');
  return { title: t('metaTitle') };
}

/** M02-F02: bulk import of units and residents from a CSV or XLSX file. */
export default async function ImportPage() {
  const scope = await requireAdminScope('registry');
  const t = await getTranslations('registry.import');
  return (
    <>
      <PageHeader title={t('title')} />
      <ImportWizard writable={scope.writable} />
    </>
  );
}
