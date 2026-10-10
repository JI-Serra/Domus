import { supportDisplayStatus } from '@domus/domain/platform';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ActiveSupportSession } from '@/components/platform/active-support-session';
import { PlatformSupportSessionList } from '@/components/platform/support-session-list';
import type { SupportSessionItem } from '@/components/platform/support-session-list';
import { SupportStartForm } from '@/components/platform/support-start-form';
import { PageHeader } from '@/components/shell/page-header';
import { Card } from '@/components/ui/card';
import { getRequestContext } from '@/lib/context/request-context';
import { listSupportSessions, listTenants } from '@/lib/platform/data';
import { createRequestClient } from '@/lib/supabase/request-client';
import {
  endOwnSupportSessionAction,
  lookupSupportTargetsAction,
  startSupportAction,
} from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.support');
  return { title: t('metaTitle') };
}

/** M01-F04: start a support session (act as a user of a barrio, with a reason) and review the sessions so far. */
export default async function PlatformSupportPage() {
  const t = await getTranslations('platform.support');
  const request = await getRequestContext();
  const client = await createRequestClient();
  const [tenants, sessions] = await Promise.all([
    listTenants(client),
    listSupportSessions(client, { limit: 50 }),
  ]);
  const now = new Date();
  const me = request?.identity.userId;
  const tenantNames = new Map(
    tenants.map((tenant) => [tenant.tenant_id, tenant.tenant_name]),
  );

  const items: SupportSessionItem[] = sessions.map((session) => ({
    ...session,
    tenantName: tenantNames.get(session.tenant_id) ?? '',
    actorLabel:
      session.support_session_actor_user_id === me
        ? t('actor.you')
        : t('actor.other'),
    // The platform has no read access to people (S5), so a session names its target by a short code.
    targetLabel: `#${session.support_session_target_user_id.slice(-6)}`,
  }));
  const running = sessions.find(
    (session) =>
      session.support_session_actor_user_id === me &&
      supportDisplayStatus(session, now) === 'active',
  );

  return (
    <>
      <PageHeader title={t('title')} />
      {running ? (
        <ActiveSupportSession
          sessionId={running.support_session_id}
          tenantName={tenantNames.get(running.tenant_id) ?? ''}
          expiresAt={running.support_session_expires_at}
          end={endOwnSupportSessionAction}
        />
      ) : null}
      <Card>
        <SupportStartForm
          tenants={tenants
            .filter(
              (tenant) => tenant.tenant_subscription_status !== 'cancelled',
            )
            .map(({ tenant_id, tenant_name }) => ({ tenant_id, tenant_name }))}
          lookup={lookupSupportTargetsAction}
          action={startSupportAction}
        />
      </Card>
      <Card className="mt-6">
        <h2 className="mb-4 text-app-heading">{t('history.title')}</h2>
        <PlatformSupportSessionList sessions={items} now={now} />
      </Card>
    </>
  );
}
