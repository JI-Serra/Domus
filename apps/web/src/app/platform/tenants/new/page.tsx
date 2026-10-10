import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { TenantForm } from '@/components/platform/tenant-form';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { createTenantAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.tenants.new');
  return { title: t('metaTitle') };
}

export default async function NewTenantPage() {
  const t = await getTranslations('platform.tenants.new');
  return (
    <>
      <PageHeader title={t('title')} />
      <Card>
        <TenantForm mode="create" action={createTenantAction} />
      </Card>
    </>
  );
}
