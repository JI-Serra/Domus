import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VerificationLists } from '@/components/registry/verification-lists';
import { PageHeader } from '@/components/shell/page-header';
import { requireAdminScope } from '@/lib/registry/guard';
import { loadPendingVerification } from '@/lib/registry/verification';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.verification');
  return { title: t('metaTitle') };
}

/** T19: identity and plate claims that collide with another record and wait for the registry to settle them. */
export default async function VerificationPage() {
  const scope = await requireAdminScope('registry');
  const [pending, t] = await Promise.all([
    loadPendingVerification(scope.client, scope.tenantId),
    getTranslations('registry.verification'),
  ]);
  return (
    <>
      <PageHeader title={t('title')} />
      <VerificationLists
        people={pending.people}
        vehicles={pending.vehicles}
        writable={scope.writable}
      />
    </>
  );
}
