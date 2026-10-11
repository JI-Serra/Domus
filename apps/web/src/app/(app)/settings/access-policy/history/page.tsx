import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HistoryList } from '@/components/access-policy/history-list';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { InfoButton } from '@/components/ui/info-button';
import {
  loadAccessPolicyHistory,
  loadPersonNames,
} from '@/lib/access-policy/data';
import { requirePolicyScope } from '@/lib/access-policy/scope';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('accessPolicy.historyPage');
  return { title: t('metaTitle') };
}

/** M03-F06: the change history of the access policy; only for administrators with `access_config`. */
export default async function AccessPolicyHistoryPage() {
  const scope = await requirePolicyScope();
  if (!scope.canConfigure) notFound();
  const [items, t, back] = await Promise.all([
    loadAccessPolicyHistory(scope.client, scope.tenantId),
    getTranslations('accessPolicy.historyPage'),
    getTranslations('accessPolicy'),
  ]);
  // Names only for the people this administrator may read in the registry; everybody else shows as a role.
  const people = await loadPersonNames(
    scope.client,
    scope.tenantId,
    items.flatMap((item) =>
      [item.actorUserId, item.onBehalfOfUserId].filter(
        (id): id is string => id !== null,
      ),
    ),
  );
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-1">
            {t('title')}
            <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
          </span>
        }
        action={
          <ButtonLink
            href="/settings/access-policy"
            variant="secondary"
            icon={<ArrowLeft aria-hidden="true" className="size-5" />}
          >
            {back('backToPolicy')}
          </ButtonLink>
        }
      />
      <HistoryList
        items={items}
        names={Object.fromEntries(people)}
        timeZone={scope.timeZone}
      />
    </>
  );
}
