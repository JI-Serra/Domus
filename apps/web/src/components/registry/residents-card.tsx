'use client';

import { formatDate } from '@domus/domain/format';
import {
  Crown,
  Mail,
  Pencil,
  Plus,
  UserCheck,
  UserMinus,
  Baby,
  UsersRound,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { InfoButton } from '@/components/ui/info-button';
import { Sheet } from '@/components/ui/sheet';
import { useRunAction } from '@/lib/registry/use-run-action';
import type { UnitSheet } from '@/lib/registry/data';
import { endResidenceAction } from '@/app/(app)/registry/units/actions';
import { InviteResidentForm } from './invite-resident-form';
import { ResidentForm } from './resident-form';
import { useErrorMessage } from './use-error-message';

type Resident = UnitSheet['residents'][number];

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

export interface ResidentsCardProps {
  unitId: string;
  residents: readonly Resident[];
  /** People of this unit that already have an account membership. */
  accountPersonIds: readonly string[];
  writable: boolean;
  /** Server time at render, so the first client render matches the server's. */
  now: string;
  timeZone: string;
}

type Panel =
  | { kind: 'add' }
  | { kind: 'edit'; resident: Resident }
  | { kind: 'invite'; resident: Resident }
  | null;

/** Residents of the unit (M02-F03): add, edit, end residence, and invite to open an account (M02-F04). */
export function ResidentsCard({
  unitId,
  residents,
  accountPersonIds,
  writable,
  now,
  timeZone,
}: ResidentsCardProps) {
  const t = useTranslations('registry.residents');
  const noticeT = useTranslations('registry.notices');
  const message = useErrorMessage();
  const [panel, setPanel] = useState<Panel>(null);
  const [ending, setEnding] = useState<Resident | null>(null);
  const action = useRunAction();

  const instant = new Date(now).getTime();
  const isCurrent = (resident: Resident) =>
    new Date(resident.unit_resident_valid_from_at).getTime() <= instant &&
    (resident.unit_resident_valid_to_at === null ||
      new Date(resident.unit_resident_valid_to_at).getTime() > instant);
  const current = residents.filter(isCurrent);
  const past = residents.filter((resident) => !isCurrent(resident));
  const fullName = (resident: Resident) =>
    `${resident.person_first_name ?? ''} ${resident.person_last_name ?? ''}`.trim();

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('title')}</h2>
          <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
        </div>
        {writable ? (
          <Button
            icon={<Plus {...iconProps} />}
            onClick={() => setPanel({ kind: 'add' })}
          >
            {t('add')}
          </Button>
        ) : null}
      </div>

      {action.error ? (
        <AuthNotice tone="error">{message(action.error)}</AuthNotice>
      ) : null}
      {action.notice ? (
        <AuthNotice tone="success">
          {noticeT.has(action.notice as 'residenceEnded')
            ? noticeT(action.notice as 'residenceEnded')
            : noticeT('saved')}
        </AuthNotice>
      ) : null}

      {current.length === 0 ? (
        <EmptyState icon={UsersRound} title={t('empty')} align="start" />
      ) : (
        <ul aria-label={t('listLabel')} className="flex flex-col">
          {current.map((resident) => {
            const hasAccount = accountPersonIds.includes(resident.person_id);
            const canInvite =
              writable &&
              !resident.unit_resident_is_minor &&
              !hasAccount &&
              Boolean(resident.person_email);
            return (
              <li
                key={resident.unit_resident_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-app-subheading">
                      {fullName(resident)}
                    </span>
                    {resident.unit_resident_is_holder ? (
                      <Badge
                        tone="info"
                        icon={
                          <Crown
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        }
                      >
                        {t('holder')}
                      </Badge>
                    ) : null}
                    {resident.unit_resident_is_minor ? (
                      <Badge
                        tone="warning"
                        icon={
                          <Baby
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        }
                      >
                        {t('minor')}
                      </Badge>
                    ) : null}
                    {hasAccount ? (
                      <Badge
                        tone="success"
                        icon={
                          <UserCheck
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        }
                      >
                        {t('hasAccount')}
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-app-caption text-text-secondary">
                    {t(`relationship.${resident.unit_resident_relationship}`)}
                    {resident.person_document_number
                      ? ` · ${resident.person_document_type === 'dni' ? 'DNI' : t('document')} ${resident.person_document_number}`
                      : ''}
                    {resident.person_email ? ` · ${resident.person_email}` : ''}
                  </span>
                  <span className="text-app-caption text-text-secondary">
                    {t('since', {
                      date: formatDate(
                        resident.unit_resident_valid_from_at,
                        timeZone,
                      ),
                    })}
                  </span>
                </div>
                {writable ? (
                  <div className="flex flex-wrap gap-2">
                    {canInvite ? (
                      <Button
                        variant="secondary"
                        icon={<Mail {...iconProps} />}
                        onClick={() => setPanel({ kind: 'invite', resident })}
                        aria-label={t('inviteNamed', {
                          name: fullName(resident),
                        })}
                      >
                        {t('inviteAction')}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      icon={<Pencil {...iconProps} />}
                      onClick={() => setPanel({ kind: 'edit', resident })}
                      aria-label={t('editNamed', { name: fullName(resident) })}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<UserMinus {...iconProps} />}
                      onClick={() => setEnding(resident)}
                      aria-label={t('endNamed', { name: fullName(resident) })}
                    >
                      {t('end')}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {past.length > 0 ? (
        <details className="border-t border-hairline pt-3">
          <summary className="min-h-(--control-height) cursor-pointer py-2 text-app-body-dense">
            {t('pastTitle', { count: past.length })}
          </summary>
          <ul className="flex flex-col gap-1 pb-2">
            {past.map((resident) => (
              <li
                key={resident.unit_resident_id}
                className="flex flex-wrap items-center gap-2 text-app-body-dense text-text-secondary"
              >
                <span>{fullName(resident)}</span>
                <span>
                  {t('endedOn', {
                    date: formatDate(
                      resident.unit_resident_valid_to_at ??
                        resident.unit_resident_valid_from_at,
                      timeZone,
                    ),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Sheet
        open={panel?.kind === 'add' || panel?.kind === 'edit'}
        title={panel?.kind === 'edit' ? t('editTitle') : t('addTitle')}
        closeLabel={t('close')}
        onClose={() => setPanel(null)}
      >
        {panel?.kind === 'add' || panel?.kind === 'edit' ? (
          <ResidentForm
            unitId={unitId}
            resident={panel.kind === 'edit' ? panel.resident : undefined}
            onDone={() => setPanel(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={panel?.kind === 'invite'}
        title={t('inviteTitle')}
        closeLabel={t('close')}
        onClose={() => setPanel(null)}
      >
        {panel?.kind === 'invite' ? (
          <InviteResidentForm
            unitId={unitId}
            personId={panel.resident.person_id}
            email={panel.resident.person_email ?? ''}
            isHolder={panel.resident.unit_resident_is_holder}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={ending !== null}
        title={t('endTitle')}
        confirmLabel={t('endConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={action.pending}
        onCancel={() => setEnding(null)}
        onConfirm={() => {
          const target = ending;
          if (!target) return;
          // The dialog closes at once; the outcome (success or the holder rule) shows above the list.
          action.run(() => endResidenceAction(unitId, target.person_id));
          setEnding(null);
        }}
      >
        {ending ? t('endBody', { name: fullName(ending) }) : null}
      </ConfirmDialog>
    </Card>
  );
}
