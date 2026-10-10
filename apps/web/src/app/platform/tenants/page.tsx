import { formatDate } from '@domus/domain/format';
import { Building2, Plus, Search, X } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { SubscriptionBadge } from '@/components/platform/subscription-badge';
import { PageHeader } from '@/components/shell/page-header';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/field';
import { listTenants, sanitizeSearch } from '@/lib/platform/data';
import { createRequestClient } from '@/lib/supabase/request-client';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('platform.tenants');
  return { title: t('metaTitle') };
}

/** M01-F01/F02: every barrio with its subscription status, searchable by name or identifier. */
export default async function PlatformTenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const t = await getTranslations('platform.tenants');
  const { q } = await searchParams;
  const search = sanitizeSearch(typeof q === 'string' ? q : '');
  const tenants = await listTenants(await createRequestClient(), search);

  return (
    <>
      <PageHeader
        title={t('title')}
        action={
          <ButtonLink
            href="/platform/tenants/new"
            icon={
              <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
            }
          >
            {t('create')}
          </ButtonLink>
        }
      />

      <form
        role="search"
        method="get"
        action="/platform/tenants"
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <label htmlFor="tenant-search" className="sr-only">
          {t('searchLabel')}
        </label>
        <Input
          id="tenant-search"
          name="q"
          type="search"
          defaultValue={search}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
          className="min-w-0 flex-1 basis-64 sm:max-w-md"
        />
        <Button
          type="submit"
          variant="secondary"
          icon={
            <Search aria-hidden="true" className="size-5" strokeWidth={2} />
          }
        >
          {t('searchSubmit')}
        </Button>
        {search ? (
          <Link
            href="/platform/tenants"
            className="inline-flex min-h-(--control-height) items-center gap-1 px-2 text-app-body-dense text-info underline underline-offset-4"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('searchClear')}
          </Link>
        ) : null}
      </form>

      {tenants.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={search ? t('emptySearchTitle') : t('emptyTitle')}
            align="start"
          />
        </Card>
      ) : (
        <Card density="dense" className="overflow-x-auto p-0">
          <table aria-label={t('listLabel')} className="w-full text-left">
            <thead>
              <tr className="text-app-caption text-text-secondary">
                <th scope="col" className="px-4 py-3 font-normal">
                  {t('table.name')}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t('table.status')}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-normal md:table-cell"
                >
                  {t('table.created')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.tenant_id} className="border-t border-hairline">
                  <td className="px-4 py-2">
                    <Link
                      href={`/platform/tenants/${tenant.tenant_id}`}
                      aria-label={t('open', { name: tenant.tenant_name })}
                      className="flex min-h-(--control-height) flex-col justify-center"
                    >
                      <span className="text-app-subheading">
                        {tenant.tenant_name}
                      </span>
                      <span className="text-app-caption text-text-secondary">
                        {tenant.tenant_slug}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <SubscriptionBadge
                      status={tenant.tenant_subscription_status}
                    />
                  </td>
                  <td className="hidden px-4 py-2 text-app-body-dense md:table-cell">
                    {formatDate(
                      tenant.tenant_created_at,
                      tenant.tenant_time_zone,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
