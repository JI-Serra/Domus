import { Hammer } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

/** Placeholder: the platform data task fills this page. */
export default async function PlatformSupportPage() {
  const nav = await getTranslations('nav');
  const t = await getTranslations('placeholder');
  return (
    <>
      <PageHeader title={nav('items.support')} />
      <Card>
        <EmptyState icon={Hammer} title={t('title')} align="start" />
      </Card>
    </>
  );
}
