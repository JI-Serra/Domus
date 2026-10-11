import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GuardInviteForm } from '@/components/registry/guard-invite-form';
import { GuardsList } from '@/components/registry/guards-list';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { getRequestContext } from '@/lib/context/request-context';
import { listGates, loadTenantGuards } from '@/lib/registry/data';
import { requireAdminScope } from '@/lib/registry/guard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.guards');
  return { title: t('metaTitle') };
}

/** M02-F06: guards of the barrio, for administrators with `guards` (list, invitations, gate assignment, deactivation). */
export default async function GuardsPage() {
  const scope = await requireAdminScope('guards');
  const request = await getRequestContext();
  const timeZone =
    request?.resolved.active?.tenant_time_zone ?? 'America/Argentina/Tucuman';
  const [{ guards, invitations }, gates, t] = await Promise.all([
    loadTenantGuards(scope.client, scope.tenantId),
    listGates(scope.client, scope.tenantId),
    getTranslations('registry.guards'),
  ]);
  return (
    <>
      <PageHeader title={t('pageTitle')} />
      <div className="flex flex-col gap-6">
        {scope.writable ? (
          <Card density="dense">
            <GuardInviteForm />
          </Card>
        ) : null}
        <GuardsList
          guards={guards}
          gates={gates}
          invitations={invitations}
          writable={scope.writable}
          timeZone={timeZone}
        />
      </div>
    </>
  );
}
