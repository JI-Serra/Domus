'use client';

import { formatDate } from '@domus/domain/format';
import {
  CircleCheck,
  MailX,
  ShieldCheck,
  ShieldOff,
  UserX,
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
import { Switch } from '@/components/ui/switch';
import {
  assignGuardGateAction,
  deactivateGuardAction,
  revokeGuardInvitationAction,
} from '@/app/(app)/registry/guards/actions';
import type {
  GateRow,
  GuardInvitationRow,
  GuardItem,
} from '@/lib/registry/data';
import { useRunAction } from '@/lib/registry/use-run-action';
import { useErrorMessage } from './use-error-message';

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

export interface GuardsListProps {
  guards: readonly GuardItem[];
  gates: readonly GateRow[];
  invitations: readonly GuardInvitationRow[];
  writable: boolean;
  timeZone: string;
}

/** Guards of the barrio (M02-F06): their gates, deactivation, and the invitations still waiting. */
export function GuardsList({
  guards,
  gates,
  invitations,
  writable,
  timeZone,
}: GuardsListProps) {
  const t = useTranslations('registry.guards');
  const noticeT = useTranslations('registry.notices');
  const message = useErrorMessage();
  const [deactivating, setDeactivating] = useState<GuardItem | null>(null);
  const action = useRunAction();
  const gateName = (gateId: string) =>
    gates.find((gate) => gate.gate_id === gateId)?.gate_name ?? '—';
  const fullName = (guard: GuardItem) =>
    `${guard.person_first_name} ${guard.person_last_name}`;

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <h2 className="text-app-heading">{t('title')}</h2>
        <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
      </div>
      {action.error ? (
        <AuthNotice tone="error">{message(action.error)}</AuthNotice>
      ) : null}
      {action.notice ? (
        <AuthNotice tone="success">
          {noticeT.has(action.notice as 'saved')
            ? noticeT(action.notice as 'saved')
            : noticeT('saved')}
        </AuthNotice>
      ) : null}

      {guards.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('empty')} align="start" />
      ) : (
        <ul aria-label={t('listLabel')} className="flex flex-col">
          {guards.map((guard) => {
            const active = guard.membership_status === 'active';
            return (
              <li
                key={guard.membership_id}
                className="flex flex-col gap-3 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-app-subheading">
                        {fullName(guard)}
                      </span>
                      {active ? (
                        <Badge
                          tone="success"
                          icon={
                            <CircleCheck
                              aria-hidden="true"
                              className="size-[1.25em]"
                              strokeWidth={2}
                            />
                          }
                        >
                          {t('status.active')}
                        </Badge>
                      ) : (
                        <Badge
                          tone="neutral"
                          icon={
                            <ShieldOff
                              aria-hidden="true"
                              className="size-[1.25em]"
                              strokeWidth={2}
                            />
                          }
                        >
                          {t('status.inactive')}
                        </Badge>
                      )}
                    </span>
                    {guard.person_email ? (
                      <span className="text-app-caption break-all text-text-secondary">
                        {guard.person_email}
                      </span>
                    ) : null}
                  </div>
                  {writable && active ? (
                    <Button
                      variant="secondary"
                      icon={<UserX {...iconProps} />}
                      aria-label={t('deactivateNamed', {
                        name: fullName(guard),
                      })}
                      onClick={() => setDeactivating(guard)}
                    >
                      {t('deactivate')}
                    </Button>
                  ) : null}
                </div>
                {active ? (
                  <fieldset className="flex min-w-0 flex-col gap-1">
                    <legend className="mb-1 text-app-caption text-text-secondary">
                      {t('gates')}
                    </legend>
                    {gates.length === 0 ? (
                      <span className="text-app-body-dense text-text-secondary">
                        {guard.gate_ids.length === 0
                          ? t('noGates')
                          : guard.gate_ids.map(gateName).join(', ')}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-x-6">
                        {gates.map((gate) => (
                          <Switch
                            key={gate.gate_id}
                            label={gate.gate_name}
                            checked={guard.gate_ids.includes(gate.gate_id)}
                            disabled={!writable || action.pending}
                            onChange={(event) =>
                              action.run(() =>
                                assignGuardGateAction(
                                  guard.membership_id,
                                  gate.gate_id,
                                  event.target.checked,
                                ),
                              )
                            }
                          />
                        ))}
                      </div>
                    )}
                  </fieldset>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {invitations.length > 0 ? (
        <section aria-label={t('pendingTitle')} className="flex flex-col gap-2">
          <h3 className="text-app-subheading">{t('pendingTitle')}</h3>
          <ul className="flex flex-col">
            {invitations.map((invitation) => (
              <li
                key={invitation.invitation_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col">
                  <span className="text-app-subheading break-all">
                    {invitation.invitation_email}
                  </span>
                  <span className="text-app-caption text-text-secondary">
                    {[
                      invitation.invitation_first_name,
                      invitation.invitation_last_name,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    {' · '}
                    {t('expires', {
                      date: formatDate(
                        invitation.invitation_expires_at,
                        timeZone,
                      ),
                    })}
                  </span>
                </div>
                {writable ? (
                  <Button
                    variant="secondary"
                    icon={<MailX {...iconProps} />}
                    disabled={action.pending}
                    aria-label={t('revokeNamed', {
                      email: invitation.invitation_email,
                    })}
                    onClick={() =>
                      action.run(() =>
                        revokeGuardInvitationAction(invitation.invitation_id),
                      )
                    }
                  >
                    {t('revoke')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={deactivating !== null}
        title={t('deactivateTitle')}
        confirmLabel={t('deactivateConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={action.pending}
        onCancel={() => setDeactivating(null)}
        onConfirm={() => {
          const target = deactivating;
          if (!target) return;
          action.run(() => deactivateGuardAction(target.membership_id));
          setDeactivating(null);
        }}
      >
        {deactivating
          ? t('deactivateBody', { name: fullName(deactivating) })
          : null}
      </ConfirmDialog>
    </Card>
  );
}
