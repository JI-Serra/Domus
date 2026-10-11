'use client';

import {
  BadgeCheck,
  Car,
  Check,
  Trash2,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { InfoButton } from '@/components/ui/info-button';
import {
  resolvePersonClaimAction,
  resolveVehicleClaimAction,
} from '@/app/(app)/registry/verification/actions';
import { useRunAction } from '@/lib/registry/use-run-action';
import type {
  PendingPerson,
  PendingVehicle,
} from '@/lib/registry/verification';
import { useErrorMessage } from './use-error-message';

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

function UnitLink({ unit }: { unit: { unit_id: string; unit_code: string } }) {
  return (
    <Link
      href={`/registry/units/${unit.unit_id}`}
      className="text-info underline underline-offset-4"
    >
      {unit.unit_code}
    </Link>
  );
}

/**
 * Claims waiting for the registry (T19): what households declared for a person or a plate that collides with
 * somebody else's record. Nothing is merged implicitly: the administrator keeps the register's data or accepts the
 * declared data, and the database refuses the latter while another record still holds it.
 */
export function VerificationLists({
  people,
  vehicles,
  writable,
}: {
  people: readonly PendingPerson[];
  vehicles: readonly PendingVehicle[];
  writable: boolean;
}) {
  const t = useTranslations('registry.verification');
  const noticeT = useTranslations('registry.notices');
  const message = useErrorMessage();
  const person = useRunAction();
  const vehicle = useRunAction();
  const error = person.error ?? vehicle.error;
  const notice = person.notice ?? vehicle.notice;

  const identity = (value: PendingPerson['registered']) =>
    [
      value.documentNumber
        ? `${value.documentType === 'dni' ? t('dni') : (value.documentType ?? '')} ${value.documentNumber}`.trim()
        : null,
      value.email,
    ]
      .filter(Boolean)
      .join(' · ') || t('none');

  return (
    <div className="flex flex-col gap-6">
      {error ? <AuthNotice tone="error">{message(error)}</AuthNotice> : null}
      {notice ? (
        <AuthNotice tone="success">
          {noticeT.has(notice as 'saved')
            ? noticeT(notice as 'saved')
            : noticeT('saved')}
        </AuthNotice>
      ) : null}

      <Card density="dense" className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('peopleTitle')}</h2>
          <InfoButton label={t('peopleInfoLabel')}>
            {t('peopleInfo')}
          </InfoButton>
        </div>
        {people.length === 0 ? (
          <EmptyState
            icon={UserRoundCheck}
            title={t('peopleEmpty')}
            align="start"
            className="py-3"
          />
        ) : (
          <ul aria-label={t('peopleTitle')} className="flex flex-col">
            {people.map((item) => {
              const name = `${item.person_first_name} ${item.person_last_name}`;
              return (
                <li
                  key={item.person_id}
                  className="flex flex-col gap-3 border-t border-hairline py-4 first:border-t-0"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-app-subheading">{name}</span>
                    {item.unit ? (
                      <span className="text-app-body-dense text-text-secondary">
                        {t('unit')} <UnitLink unit={item.unit} />
                      </span>
                    ) : null}
                  </div>
                  <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    <div className="flex flex-col">
                      <dt className="text-app-caption text-text-secondary">
                        {t('registered')}
                      </dt>
                      <dd className="text-app-body-dense break-all">
                        {identity(item.registered)}
                      </dd>
                    </div>
                    <div className="flex flex-col">
                      <dt className="text-app-caption text-text-secondary">
                        {t('declared')}
                      </dt>
                      <dd className="text-app-body-dense break-all">
                        {identity(item.declared)}
                      </dd>
                    </div>
                  </dl>
                  {item.holders.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-x-2 text-app-body-dense">
                      <UsersRound
                        aria-hidden="true"
                        className="size-4 text-text-secondary"
                        strokeWidth={2}
                      />
                      {t('heldBy')}
                      {item.holders.map((holder) => (
                        <span
                          key={holder.person_id}
                          className="inline-flex gap-1"
                        >
                          <strong>{holder.name}</strong>
                          {holder.units.map((unit) => (
                            <UnitLink key={unit.unit_id} unit={unit} />
                          ))}
                        </span>
                      ))}
                    </p>
                  ) : null}
                  {writable ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        icon={<Check {...iconProps} />}
                        disabled={person.pending || !item.unit}
                        aria-label={t('acceptNamed', { name })}
                        onClick={() =>
                          person.run(() =>
                            resolvePersonClaimAction(
                              item.person_id,
                              'declared',
                            ),
                          )
                        }
                      >
                        {t('accept')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<X {...iconProps} />}
                        disabled={person.pending || !item.unit}
                        aria-label={t('keepNamed', { name })}
                        onClick={() =>
                          person.run(() =>
                            resolvePersonClaimAction(
                              item.person_id,
                              'registered',
                            ),
                          )
                        }
                      >
                        {t('keep')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card density="dense" className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('vehiclesTitle')}</h2>
          <InfoButton label={t('vehiclesInfoLabel')}>
            {t('vehiclesInfo')}
          </InfoButton>
        </div>
        {vehicles.length === 0 ? (
          <EmptyState
            icon={Car}
            title={t('vehiclesEmpty')}
            align="start"
            className="py-3"
          />
        ) : (
          <ul aria-label={t('vehiclesTitle')} className="flex flex-col">
            {vehicles.map((item) => (
              <li
                key={item.vehicle_id}
                className="flex flex-col gap-3 border-t border-hairline py-4 first:border-t-0"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-app-subheading tracking-wider">
                    {item.vehicle_plate_code}
                  </span>
                  <span className="text-app-body-dense text-text-secondary">
                    {t('unit')} <UnitLink unit={item.unit} />
                    {[item.vehicle_make_name, item.vehicle_model_name].filter(
                      Boolean,
                    ).length > 0
                      ? ` · ${[item.vehicle_make_name, item.vehicle_model_name].filter(Boolean).join(' ')}`
                      : ''}
                  </span>
                </div>
                {item.holders.length > 0 ? (
                  <p className="flex flex-wrap items-center gap-x-2 text-app-body-dense">
                    <BadgeCheck
                      aria-hidden="true"
                      className="size-4 text-text-secondary"
                      strokeWidth={2}
                    />
                    {t('plateHeldBy')}
                    {item.holders.map((holder) => (
                      <UnitLink key={holder.vehicle_id} unit={holder.unit} />
                    ))}
                  </p>
                ) : null}
                {writable ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      icon={<BadgeCheck {...iconProps} />}
                      disabled={vehicle.pending}
                      aria-label={t('verifyNamed', {
                        plate: item.vehicle_plate_code,
                      })}
                      onClick={() =>
                        vehicle.run(() =>
                          resolveVehicleClaimAction(item.vehicle_id, 'verify'),
                        )
                      }
                    >
                      {t('verify')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<Trash2 {...iconProps} />}
                      disabled={vehicle.pending}
                      aria-label={t('discardNamed', {
                        plate: item.vehicle_plate_code,
                      })}
                      onClick={() =>
                        vehicle.run(() =>
                          resolveVehicleClaimAction(item.vehicle_id, 'discard'),
                        )
                      }
                    >
                      {t('discard')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
