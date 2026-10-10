import { formatDate } from '@domus/domain/format';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AuthNotice } from '@/components/auth/auth-notice';
import { BillableForm } from '@/components/platform/billable-form';
import {
  InvitationList,
  InviteAdminForm,
} from '@/components/platform/invitations';
import { SubscriptionBadge } from '@/components/platform/subscription-badge';
import { SubscriptionPanel } from '@/components/platform/subscription-panel';
import { TenantForm } from '@/components/platform/tenant-form';
import { PageHeader } from '@/components/shell/page-header';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getTenant, listInvitations, signedLogoUrl } from '@/lib/platform/data';
import { createRequestClient } from '@/lib/supabase/request-client';
import {
  changeSubscriptionAction,
  inviteAdminAction,
  revokeInvitationAction,
  saveBillableCriteriaAction,
  updateTenantAction,
} from '../actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.tenants.detail');
  return { title: t('metaTitle') };
}

/** M01-F01/F02/F03: one barrio — data, logo, subscription, billable criteria and its first-administrator invitations. */
export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ notice?: string | string[] }>;
}) {
  const { tenantId } = await params;
  if (!UUID.test(tenantId)) notFound();
  const { notice } = await searchParams;

  const client = await createRequestClient();
  const tenant = await getTenant(client, tenantId);
  if (!tenant) notFound();
  const [invitations, logoUrl, t, notices] = await Promise.all([
    listInvitations(client, tenantId),
    signedLogoUrl(client, tenant.tenant_logo_path),
    getTranslations('platform.tenants'),
    getTranslations('platform.tenants.notices'),
  ]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tenant.tenant_name}
            <SubscriptionBadge status={tenant.tenant_subscription_status} />
          </span>
        }
        action={
          <ButtonLink
            href="/platform/tenants"
            variant="secondary"
            icon={
              <ArrowLeft
                aria-hidden="true"
                className="size-5"
                strokeWidth={2}
              />
            }
          >
            {t('detail.back')}
          </ButtonLink>
        }
      />
      {notice === 'logoFailed' ? (
        <AuthNotice tone="error" className="mb-4">
          {notices('logoFailed')}
        </AuthNotice>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <h2 className="mb-5 text-app-heading">{t('detail.dataTitle')}</h2>
          <TenantForm
            mode="edit"
            action={updateTenantAction.bind(null, tenantId)}
            tenant={tenant}
            logoUrl={logoUrl}
          />
          <p className="mt-4 text-app-caption text-text-secondary">
            {t('detail.createdOn', {
              date: formatDate(
                tenant.tenant_created_at,
                tenant.tenant_time_zone,
              ),
            })}
          </p>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-5 text-app-heading">{t('subscription.title')}</h2>
            <SubscriptionPanel
              current={tenant.tenant_subscription_status}
              change={changeSubscriptionAction.bind(null, tenantId)}
            />
          </Card>
          <Card>
            <h2 className="mb-5 text-app-heading">{t('billable.title')}</h2>
            <BillableForm
              selected={tenant.tenant_billable_unit_statuses}
              action={saveBillableCriteriaAction.bind(null, tenantId)}
            />
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <InviteAdminForm action={inviteAdminAction.bind(null, tenantId)} />
        <h3 className="mt-8 mb-3 text-app-subheading">
          {t('invitations.listTitle')}
        </h3>
        <InvitationList
          invitations={invitations}
          now={new Date().toISOString()}
          revoke={revokeInvitationAction.bind(null, tenantId)}
        />
      </Card>
    </>
  );
}
