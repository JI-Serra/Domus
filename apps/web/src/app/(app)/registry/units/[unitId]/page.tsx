import { formatDate } from '@domus/domain/format';
import { ArrowLeft, Banknote, DoorOpen, History, Pencil } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ArchiveUnitButton } from '@/components/registry/archive-unit-button';
import { OnboardingCard } from '@/components/registry/onboarding-card';
import { ResidentsCard } from '@/components/registry/residents-card';
import { UnitStatusBadge } from '@/components/registry/unit-status-badge';
import {
  PetsCard,
  VehiclesCard,
} from '@/components/registry/vehicles-pets-cards';
import { PageHeader } from '@/components/shell/page-header';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InfoButton } from '@/components/ui/info-button';
import { getRequestContext } from '@/lib/context/request-context';
import { loadPeople, loadUnitSheet } from '@/lib/registry/data';
import { UUID_PATTERN, requireAdminScope } from '@/lib/registry/guard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('registry.unit360');
  return { title: t('metaTitle') };
}

/** M02-F08: the unit's 360° sheet. Later modules fill the three placeholders (accesses, movements, balance). */
export default async function UnitSheetPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  if (!UUID_PATTERN.test(unitId)) notFound();
  const scope = await requireAdminScope('registry');
  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  if (!sheet) notFound();

  const request = await getRequestContext();
  const timeZone =
    request?.resolved.active?.tenant_time_zone ?? 'America/Argentina/Tucuman';
  const memberships = sheet.memberships;
  const people = await loadPeople(
    scope.client,
    scope.tenantId,
    memberships.map((membership) => membership.person_id),
  );
  const [t, roles, statusT, tUnits] = await Promise.all([
    getTranslations('registry.unit360'),
    getTranslations('roles'),
    getTranslations('registry.unit360.membershipStatus'),
    getTranslations('registry.units'),
  ]);
  const { unit } = sheet;
  const archived = unit.unit_archived_at !== null;
  const writable = scope.writable && !archived;
  const accountPersonIds = memberships
    .filter((membership) => membership.membership_status === 'active')
    .map((membership) => membership.person_id);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {unit.unit_code}
            <UnitStatusBadge status={unit.unit_status} archived={archived} />
          </span>
        }
        action={
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink
              href="/registry/units"
              variant="secondary"
              icon={
                <ArrowLeft
                  aria-hidden="true"
                  className="size-5"
                  strokeWidth={2}
                />
              }
            >
              {t('back')}
            </ButtonLink>
            {writable ? (
              <>
                <ButtonLink
                  href={`/registry/units/${unitId}/edit`}
                  variant="secondary"
                  icon={
                    <Pencil
                      aria-hidden="true"
                      className="size-5"
                      strokeWidth={2}
                    />
                  }
                >
                  {t('edit')}
                </ButtonLink>
                <ArchiveUnitButton unitId={unitId} unitCode={unit.unit_code} />
              </>
            ) : null}
          </div>
        }
      />

      <Card density="dense" className="mb-6">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label={t('block')} value={unit.unit_block_code} />
          <Fact label={t('lot')} value={unit.unit_lot_number} />
          <Fact
            label={t('coefficient')}
            value={String(unit.unit_coefficient)}
          />
          <Fact
            label={t('billable')}
            value={
              unit.unit_is_billable === null
                ? tUnits('billable.inherit')
                : unit.unit_is_billable
                  ? tUnits('billable.yes')
                  : tUnits('billable.no')
            }
          />
          <Fact label={t('contactPhone')} value={unit.unit_contact_phone} />
          <Fact label={t('backupPhone')} value={unit.unit_backup_phone} />
          <Fact
            label={t('createdOn')}
            value={formatDate(unit.unit_created_at, timeZone)}
          />
        </dl>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <ResidentsCard
            unitId={unitId}
            residents={sheet.residents}
            accountPersonIds={accountPersonIds}
            writable={writable}
            now={new Date().toISOString()}
            timeZone={timeZone}
          />
          <div className="grid items-start gap-6 md:grid-cols-2">
            <VehiclesCard
              unitId={unitId}
              vehicles={sheet.vehicles}
              writable={writable}
            />
            <PetsCard unitId={unitId} pets={sheet.pets} writable={writable} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <OnboardingCard
            unitId={unitId}
            invitations={sheet.pending_invitations}
            requests={sheet.pending_join_requests}
            writable={writable}
            timeZone={timeZone}
          />
          <Card density="dense" className="flex flex-col gap-3">
            <h2 className="text-app-heading">{t('membershipsTitle')}</h2>
            {memberships.length === 0 ? (
              <p className="text-text-secondary">{t('membershipsEmpty')}</p>
            ) : (
              <ul aria-label={t('membershipsTitle')} className="flex flex-col">
                {memberships.map((membership) => {
                  const person = people.get(membership.person_id);
                  return (
                    <li
                      key={membership.membership_id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline py-2 first:border-t-0"
                    >
                      <span className="text-app-subheading">
                        {person
                          ? `${person.person_first_name} ${person.person_last_name}`
                          : '—'}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone="info">
                          {roles(membership.membership_role)}
                        </Badge>
                        <Badge
                          tone={
                            membership.membership_status === 'active'
                              ? 'success'
                              : 'neutral'
                          }
                        >
                          {statusT(membership.membership_status)}
                        </Badge>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Placeholder
          icon={
            <DoorOpen aria-hidden="true" className="size-5" strokeWidth={2} />
          }
          title={t('authorizations')}
          infoLabel={t('authorizationsInfoLabel')}
          info={t('authorizationsInfo')}
        />
        <Placeholder
          icon={
            <History aria-hidden="true" className="size-5" strokeWidth={2} />
          }
          title={t('movements')}
          infoLabel={t('movementsInfoLabel')}
          info={t('movementsInfo')}
        />
        <Placeholder
          icon={
            <Banknote aria-hidden="true" className="size-5" strokeWidth={2} />
          }
          title={t('balance')}
          infoLabel={t('balanceInfoLabel')}
          info={t('balanceInfo')}
        />
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-app-caption text-text-secondary">{label}</dt>
      <dd className="text-app-body-dense">
        {value && value !== '' ? value : '—'}
      </dd>
    </div>
  );
}

/** A section the later modules fill (accesses, movements, balance): its title and an info button, nothing else. */
function Placeholder({
  icon,
  title,
  infoLabel,
  info,
}: {
  icon: ReactNode;
  title: string;
  infoLabel: string;
  info: string;
}) {
  return (
    <Card density="dense" className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-app-subheading text-text-secondary">
        {icon}
        {title}
      </h2>
      <InfoButton label={infoLabel}>{info}</InfoButton>
    </Card>
  );
}
