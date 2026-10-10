import { LifeBuoy } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SupportSessionList } from '@/components/platform/support-session-list';
import type { SupportSessionItem } from '@/components/platform/support-session-list';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { InfoButton } from '@/components/ui/info-button';
import { getRequestContext } from '@/lib/context/request-context';
import { listSupportSessions } from '@/lib/platform/data';
import { createRequestClient } from '@/lib/supabase/request-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settingsSupport');
  return { title: t('metaTitle') };
}

/**
 * M01-F04: every support access to this barrio — who, as whom, when, why and for how long. Only administrators with
 * the `access_audit` permission see it (the database enforces that; the page checks it first so the others get a
 * clear message instead of an empty list).
 */
export default async function SupportSettingsPage() {
  const t = await getTranslations('settingsSupport');
  const request = await getRequestContext();
  const active = request?.resolved.active;
  if (
    !request ||
    !active?.tenant_id ||
    active.membership_role !== 'tenant_admin'
  )
    notFound();

  const client = await createRequestClient();
  const { data: permission, error } = await client
    .from('membership_permission')
    .select('membership_permission_id')
    .eq('membership_id', active.membership_id)
    .eq('membership_permission_admin_permission', 'access_audit')
    .maybeSingle();
  if (error) throw new Error(`Could not load permissions (${error.code})`);

  const header = (
    <PageHeader
      title={
        <span className="flex items-center gap-1">
          {t('title')}
          <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
        </span>
      }
    />
  );
  if (!permission)
    return (
      <>
        {header}
        <Card>
          <EmptyState icon={LifeBuoy} title={t('noPermission')} align="start" />
        </Card>
      </>
    );

  const sessions = await listSupportSessions(client, {
    tenantId: active.tenant_id,
    limit: 100,
  });
  // Names of the supported people, when this administrator may read them (registry); otherwise a neutral label.
  const names = new Map<string, string>();
  const targetIds = [
    ...new Set(
      sessions.map((session) => session.support_session_target_user_id),
    ),
  ];
  if (targetIds.length > 0) {
    const { data: people } = await client
      .from('person')
      .select('user_id, person_first_name, person_last_name')
      .eq('tenant_id', active.tenant_id)
      .in('user_id', targetIds);
    for (const person of people ?? [])
      if (person.user_id)
        names.set(
          person.user_id,
          `${person.person_first_name} ${person.person_last_name}`.trim(),
        );
  }

  const items: SupportSessionItem[] = sessions.map((session) => ({
    ...session,
    actorLabel: t('whoValue'),
    targetLabel:
      names.get(session.support_session_target_user_id) ?? t('asUnknown'),
  }));
  const statuses = await getTranslations('settingsSupport.statuses');

  return (
    <>
      {header}
      <SupportSessionList
        sessions={items}
        now={new Date()}
        label={t('listLabel')}
        empty={t('empty')}
        durationLabel={t('duration')}
        whoLabel={t('who')}
        asLabel={t('as')}
        reasonLabel={t('reason')}
        minutesLabel={(minutes) => t('minutes', { minutes })}
        statusLabels={{
          active: statuses('active'),
          ended: statuses('ended'),
          revoked: statuses('revoked'),
          expired: statuses('expired'),
        }}
      />
    </>
  );
}
