import { unitListFilterSchema } from '@domus/domain/registry-ui';
import type { UnitListFilters } from '@domus/domain/registry-ui';
import {
  Building2,
  CircleCheck,
  CircleMinus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { UnitStatusBadge } from '@/components/registry/unit-status-badge';
import { PageHeader } from '@/components/shell/page-header';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { Pagination } from '@/components/ui/pagination';
import {
  listBlockCodes,
  listUnits,
  loadBillableCount,
  loadBillableCriteria,
} from '@/lib/registry/data';
import { requireAdminScope } from '@/lib/registry/guard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.units');
  return { title: t('metaTitle') };
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

function hrefFor(filters: UnitListFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.billable) params.set('billable', filters.billable);
  if (filters.block) params.set('block', filters.block);
  if (filters.archived) params.set('archived', filters.archived);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/registry/units?${query}` : '/registry/units';
}

/** M02-F01 (+ M01-F03): the barrio's units, filterable, with the billable-unit count. */
export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const scope = await requireAdminScope('registry');
  const raw = await searchParams;
  const filters = unitListFilterSchema.parse({
    q: first(raw.q) ?? '',
    status: first(raw.status),
    billable: first(raw.billable),
    block: first(raw.block) ?? '',
    archived: first(raw.archived),
    page: first(raw.page) ?? '1',
  });
  const criteria = await loadBillableCriteria(scope.client, scope.tenantId);
  const [page, blocks, billableCount, t, statusT] = await Promise.all([
    listUnits(scope.client, scope.tenantId, filters, criteria),
    listBlockCodes(scope.client, scope.tenantId),
    loadBillableCount(scope.client, scope.tenantId),
    getTranslations('registry.units'),
    getTranslations('unitStatus'),
  ]);
  const filtered = Boolean(
    filters.q ||
    filters.status ||
    filters.billable ||
    filters.block ||
    filters.archived,
  );
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <>
      <PageHeader
        title={t('title')}
        action={
          scope.writable ? (
            <ButtonLink
              href="/registry/units/new"
              icon={
                <Plus aria-hidden="true" className="size-5" strokeWidth={2} />
              }
            >
              {t('create')}
            </ButtonLink>
          ) : null
        }
      />

      <Card
        density="dense"
        className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2"
      >
        <div className="flex items-center gap-1">
          <span className="text-app-subheading">{t('billableCount')}</span>
          <InfoButton label={t('billableInfoLabel')}>
            {t('billableInfo', {
              statuses: criteria.map((s) => statusT(s)).join(', '),
            })}
          </InfoButton>
        </div>
        <span
          data-testid="billable-count"
          className="text-app-title tabular-nums"
        >
          {billableCount ?? '—'}
        </span>
      </Card>

      <form
        role="search"
        method="get"
        action="/registry/units"
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <label
            htmlFor="unit-search"
            className="text-app-caption text-text-secondary"
          >
            {t('filters.search')}
          </label>
          <Input
            id="unit-search"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder={t('filters.searchPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="flex basis-44 flex-col gap-1">
          <label
            htmlFor="unit-status"
            className="text-app-caption text-text-secondary"
          >
            {t('filters.status')}
          </label>
          <Select
            id="unit-status"
            name="status"
            defaultValue={filters.status ?? ''}
          >
            <option value="">{t('filters.all')}</option>
            {(['occupied', 'under_construction', 'vacant'] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {statusT(s)}
                </option>
              ),
            )}
          </Select>
        </div>
        <div className="flex basis-40 flex-col gap-1">
          <label
            htmlFor="unit-billable"
            className="text-app-caption text-text-secondary"
          >
            {t('filters.billable')}
          </label>
          <Select
            id="unit-billable"
            name="billable"
            defaultValue={filters.billable ?? ''}
          >
            <option value="">{t('filters.all')}</option>
            <option value="yes">{t('billable.yes')}</option>
            <option value="no">{t('billable.no')}</option>
          </Select>
        </div>
        <div className="flex basis-36 flex-col gap-1">
          <label
            htmlFor="unit-block"
            className="text-app-caption text-text-secondary"
          >
            {t('filters.block')}
          </label>
          <Select id="unit-block" name="block" defaultValue={filters.block}>
            <option value="">{t('filters.all')}</option>
            {blocks.map((block) => (
              <option key={block} value={block}>
                {block}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex min-h-(--control-height) items-center gap-2 text-app-body-dense">
          <input
            type="checkbox"
            name="archived"
            value="yes"
            defaultChecked={Boolean(filters.archived)}
            className="size-5 accent-accent"
          />
          {t('filters.archived')}
        </label>
        <Button
          type="submit"
          variant="secondary"
          icon={
            <Search aria-hidden="true" className="size-5" strokeWidth={2} />
          }
        >
          {t('filters.apply')}
        </Button>
        {filtered ? (
          <Link
            href="/registry/units"
            className="inline-flex min-h-(--control-height) items-center gap-1 px-2 text-app-body-dense text-info underline underline-offset-4"
          >
            <X aria-hidden="true" className="size-4" strokeWidth={2} />
            {t('filters.clear')}
          </Link>
        ) : null}
      </form>

      {page.units.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={filtered ? t('emptyFiltered') : t('empty')}
            align="start"
            action={
              !filtered && scope.writable ? (
                <ButtonLink href="/registry/import" variant="secondary">
                  {t('goImport')}
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card density="dense" className="overflow-x-auto p-0">
          <table aria-label={t('listLabel')} className="w-full text-left">
            <thead>
              <tr className="text-app-caption text-text-secondary">
                <th scope="col" className="px-4 py-3 font-normal">
                  {t('table.unit')}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-normal sm:table-cell"
                >
                  {t('table.blockLot')}
                </th>
                <th scope="col" className="px-4 py-3 font-normal">
                  {t('table.status')}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-right font-normal md:table-cell"
                >
                  {t('table.residents')}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 text-right font-normal lg:table-cell"
                >
                  {t('table.coefficient')}
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-normal md:table-cell"
                >
                  {t('table.billable')}
                </th>
              </tr>
            </thead>
            <tbody>
              {page.units.map((unit) => (
                <tr key={unit.unit_id} className="border-t border-hairline">
                  <td className="px-4 py-2">
                    <Link
                      href={`/registry/units/${unit.unit_id}`}
                      className="flex min-h-(--control-height) items-center text-app-subheading"
                    >
                      {unit.unit_code}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-2 text-app-body-dense sm:table-cell">
                    {[unit.unit_block_code, unit.unit_lot_number]
                      .filter(Boolean)
                      .join(' / ') || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <UnitStatusBadge
                      status={unit.unit_status}
                      archived={unit.unit_archived_at !== null}
                    />
                  </td>
                  <td className="hidden px-4 py-2 text-right text-app-body-dense tabular-nums md:table-cell">
                    {unit.resident_count}
                  </td>
                  <td className="hidden px-4 py-2 text-right text-app-body-dense tabular-nums lg:table-cell">
                    {unit.unit_coefficient}
                  </td>
                  <td className="hidden px-4 py-2 text-app-body-dense md:table-cell">
                    <span className="inline-flex items-center gap-1.5">
                      {unit.billable ? (
                        <CircleCheck
                          aria-hidden="true"
                          className="size-4 text-success"
                          strokeWidth={2}
                        />
                      ) : (
                        <CircleMinus
                          aria-hidden="true"
                          className="size-4 text-text-secondary"
                          strokeWidth={2}
                        />
                      )}
                      {unit.billable ? t('billable.yes') : t('billable.no')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Pagination
        page={filters.page}
        pageSize={page.pageSize}
        total={page.total}
        hrefFor={(target) => hrefFor(filters, target)}
        summary={t('pageOf', { page: filters.page, pages })}
        previousLabel={t('previous')}
        nextLabel={t('next')}
      />
    </>
  );
}
