'use client';

import { formatDate } from '@domus/domain/format';
import { formatJoinCode } from '@domus/domain/registry-ui';
import { Check, KeyRound, MailX, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { OneTimeSecret } from '@/components/ui/one-time-secret';
import {
  decideJoinRequestAction,
  revokeInvitationAction,
  rotateJoinCodeAction,
} from '@/app/(app)/registry/units/actions';
import type { UnitSheet } from '@/lib/registry/data';
import { useRunAction } from '@/lib/registry/use-run-action';
import { useErrorMessage } from './use-error-message';

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

export interface OnboardingCardProps {
  unitId: string;
  invitations: UnitSheet['pending_invitations'];
  requests: UnitSheet['pending_join_requests'];
  writable: boolean;
  timeZone: string;
}

/**
 * How people get into the unit: pending invitations (revocable), join requests that wait for a decision (D22: the
 * code only asks, a person approves), and the unit join code (shown once when generated).
 */
export function OnboardingCard({
  unitId,
  invitations,
  requests,
  writable,
  timeZone,
}: OnboardingCardProps) {
  const t = useTranslations('registry.onboarding');
  const roles = useTranslations('roles');
  const noticeT = useTranslations('registry.notices');
  const message = useErrorMessage();
  const code = useRunAction();
  const invitation = useRunAction();
  const decision = useRunAction();
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const feedback = [code, invitation, decision];
  const error = feedback.find((item) => item.error)?.error ?? null;
  const notice = [invitation, decision].find((item) => item.notice)?.notice;

  return (
    <Card density="dense" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('title')}</h2>
          <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
        </div>
        {writable ? (
          <Button
            variant="secondary"
            icon={<KeyRound {...iconProps} />}
            onClick={() => setConfirmingCode(true)}
          >
            {t('rotateCode')}
          </Button>
        ) : null}
      </div>

      {error === 'identityConflict' ? (
        // Approval found another record with the same document or email: nothing was created, the request stays.
        <AuthNotice tone="error" title={t('conflictTitle')}>
          {t('conflictBody')}{' '}
          <Link
            href="/registry/verification"
            className="underline underline-offset-4"
          >
            {t('conflictLink')}
          </Link>
        </AuthNotice>
      ) : error ? (
        <AuthNotice tone="error">{message(error)}</AuthNotice>
      ) : null}
      {notice ? (
        <AuthNotice tone="success">
          {noticeT.has(notice as 'saved')
            ? noticeT(notice as 'saved')
            : noticeT('saved')}
        </AuthNotice>
      ) : null}

      {code.value ? (
        <OneTimeSecret
          label={t('codeTitle')}
          value={formatJoinCode(code.value)}
          copyLabel={t('copy')}
          copiedLabel={t('copied')}
          info={{ label: t('codeInfoLabel'), text: t('codeInfo') }}
        >
          <Button variant="secondary" onClick={code.clear}>
            {t('hideCode')}
          </Button>
        </OneTimeSecret>
      ) : null}

      <section aria-label={t('requestsTitle')} className="flex flex-col gap-2">
        <h3 className="text-app-subheading">{t('requestsTitle')}</h3>
        {requests.length === 0 ? (
          <p className="text-text-secondary">{t('requestsEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {requests.map((request) => {
              const name = `${request.unit_join_request_first_name} ${request.unit_join_request_last_name}`;
              const id = request.unit_join_request_id;
              const role = requestRoles[id] ?? 'household_member';
              return (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0"
                >
                  <div className="flex min-w-0 flex-1 basis-56 flex-col">
                    <span className="text-app-subheading">{name}</span>
                    <span className="text-app-caption break-all text-text-secondary">
                      {request.unit_join_request_email}
                      {request.unit_join_request_document_number
                        ? ` · ${request.unit_join_request_document_number}`
                        : ''}
                    </span>
                  </div>
                  {writable ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        aria-label={t('requestRole', { name })}
                        value={role}
                        onChange={(event) =>
                          setRequestRoles((current) => ({
                            ...current,
                            [id]: event.target.value,
                          }))
                        }
                        className="w-auto"
                      >
                        <option value="household_member">
                          {roles('household_member')}
                        </option>
                        <option value="unit_holder">
                          {roles('unit_holder')}
                        </option>
                      </Select>
                      <Button
                        icon={<Check {...iconProps} />}
                        disabled={decision.pending}
                        aria-label={t('approveNamed', { name })}
                        onClick={() =>
                          decision.run(() =>
                            decideJoinRequestAction(unitId, id, true, role),
                          )
                        }
                      >
                        {t('approve')}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={<X {...iconProps} />}
                        disabled={decision.pending}
                        aria-label={t('rejectNamed', { name })}
                        onClick={() =>
                          decision.run(() =>
                            decideJoinRequestAction(unitId, id, false, role),
                          )
                        }
                      >
                        {t('reject')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-label={t('invitationsTitle')}
        className="flex flex-col gap-2"
      >
        <h3 className="text-app-subheading">{t('invitationsTitle')}</h3>
        {invitations.length === 0 ? (
          <p className="text-text-secondary">{t('invitationsEmpty')}</p>
        ) : (
          <ul className="flex flex-col">
            {invitations.map((item) => (
              <li
                key={item.invitation_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                  <span className="text-app-subheading break-all">
                    {item.invitation_email}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-app-caption text-text-secondary">
                    <Badge tone="info">
                      {roles(item.invitation_membership_role)}
                    </Badge>
                    {t('expires', {
                      date: formatDate(item.invitation_expires_at, timeZone),
                    })}
                  </span>
                </div>
                {writable ? (
                  <Button
                    variant="secondary"
                    icon={<MailX {...iconProps} />}
                    disabled={invitation.pending}
                    aria-label={t('revokeNamed', {
                      email: item.invitation_email,
                    })}
                    onClick={() =>
                      invitation.run(() =>
                        revokeInvitationAction(unitId, item.invitation_id),
                      )
                    }
                  >
                    {t('revoke')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmingCode}
        title={t('rotateTitle')}
        confirmLabel={t('rotateConfirm')}
        cancelLabel={t('cancel')}
        pending={code.pending}
        onCancel={() => setConfirmingCode(false)}
        onConfirm={() => {
          code.run(() => rotateJoinCodeAction(unitId));
          setConfirmingCode(false);
        }}
      >
        {t('rotateBody')}
      </ConfirmDialog>
    </Card>
  );
}
