import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PairDeviceForm } from '@/components/registry/pair-device-form';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { canPairDevices } from '@/lib/devices/access';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devices.pair');
  return { title: t('metaTitle') };
}

/** M02-F07, device side: a guard or administrator signed in on the tablet redeems the code from Puestos. */
export default async function PairDevicePage() {
  if (!(await canPairDevices())) notFound();
  const t = await getTranslations('devices.pair');
  return (
    <>
      <PageHeader title={t('title')} />
      <Card>
        <PairDeviceForm />
      </Card>
    </>
  );
}
