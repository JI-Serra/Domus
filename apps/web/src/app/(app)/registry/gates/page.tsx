import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import { GatesPanel } from '@/components/registry/gates-panel';
import { PageHeader } from '@/components/shell/page-header';
import { siteUrlFromHeaders } from '@/lib/auth/site-url';
import { getRequestContext } from '@/lib/context/request-context';
import { listDevices, listGates } from '@/lib/registry/data';
import { requireAdminScope } from '@/lib/registry/guard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.gates');
  return { title: t('metaTitle') };
}

/** M02-F07: gates ("puestos") and the devices paired to them. */
export default async function GatesPage() {
  const scope = await requireAdminScope('guards');
  const request = await getRequestContext();
  const timeZone =
    request?.resolved.active?.tenant_time_zone ?? 'America/Argentina/Tucuman';
  const [gates, devices, t, origin] = await Promise.all([
    listGates(scope.client, scope.tenantId),
    listDevices(scope.client, scope.tenantId),
    getTranslations('registry.gates'),
    headers().then(siteUrlFromHeaders),
  ]);
  return (
    <>
      <PageHeader title={t('pageTitle')} />
      <GatesPanel
        gates={gates}
        devices={devices}
        writable={scope.writable}
        timeZone={timeZone}
        tabletUrl={`${origin}/devices/pair`}
      />
    </>
  );
}
