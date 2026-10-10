'use client';

import {
  canRevokeInvitation,
  invitationDisplayStatus,
} from '@domus/domain/platform';
import type { InvitationStatus } from '@domus/domain/platform';
import { formatDate } from '@domus/domain/format';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Badge, StatusBadge } from '@/components/ui/badge';
import type { StatusTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { PlatformFormState } from '@/lib/platform/form-state';

type FormAction = (
  previous: PlatformFormState,
  formData: FormData,
) => Promise<PlatformFormState>;

export interface InvitationItem {
  invitation_id: string;
  invitation_email: string;
  invitation_first_name: string | null;
  invitation_last_name: string | null;
  invitation_status: InvitationStatus;
  invitation_expires_at: string;
}

const STATUS_TONES: Record<InvitationStatus, StatusTone | 'neutral'> = {
  pending: 'info',
  accepted: 'success',
  revoked: 'neutral',
  expired: 'warning',
};

function useMessage() {
  const errorsT = useTranslations('platform.tenants.errors');
  return (key: string | undefined) =>
    key === undefined
      ? undefined
      : errorsT.has(key as 'unknown')
        ? errorsT(key as 'unknown')
        : errorsT('unknown');
}

/** Form that invites the barrio's first administrator by email (M01-F01). */
export function InviteAdminForm({ action }: { action: FormAction }) {
  const t = useTranslations('platform.tenants.invitations');
  const notices = useTranslations('platform.tenants.notices');
  const message = useMessage();
  const { state, onSubmit, pending } = useSubmitAction(action);
  // The key identifies one invitation: retrying the same submission cannot send a second email.
  // After a success the next submission is a new invitation, so the key (and the form) are renewed.
  const [eventId, setEventId] = useState(() => crypto.randomUUID());
  const [renewedFor, setRenewedFor] = useState<PlatformFormState | null>(null);
  if (state.status === 'success' && renewedFor !== state) {
    setRenewedFor(state);
    setEventId(crypto.randomUUID());
  }
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      key={state.status === 'success' ? eventId : 'form'}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-1">
        <h3 className="text-app-subheading">{t('title')}</h3>
        <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
      </div>
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      {state.status === 'success' ? (
        <AuthNotice tone="success">{notices('invited')}</AuthNotice>
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label={t('firstName')} error={message(errors.first_name)}>
          <Input
            name="first_name"
            defaultValue={values.first_name ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field label={t('lastName')} error={message(errors.last_name)}>
          <Input
            name="last_name"
            defaultValue={values.last_name ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field label={t('email')} error={message(errors.invited_email)}>
          <Input
            name="invited_email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.invited_email ?? ''}
          />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : t('send')}
        </Button>
      </div>
    </form>
  );
}

/** Invitations of the barrio with their status; a pending one can be revoked. */
export function InvitationList({
  invitations,
  now,
  revoke,
}: {
  invitations: readonly InvitationItem[];
  /** Server time at render, so the first client render matches the server's. */
  now: string;
  revoke: (invitationId: string) => Promise<PlatformFormState>;
}) {
  const t = useTranslations('platform.tenants.invitations');
  const message = useMessage();
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const instant = new Date(now);

  if (invitations.length === 0)
    return <p className="text-text-secondary">{t('empty')}</p>;

  return (
    <div className="flex flex-col gap-3">
      {error ? <AuthNotice tone="error">{message(error)}</AuthNotice> : null}
      <ul aria-label={t('listLabel')} className="flex flex-col gap-2">
        {invitations.map((invitation) => {
          const status = invitationDisplayStatus(invitation, instant);
          const tone = STATUS_TONES[status];
          const name = [
            invitation.invitation_first_name,
            invitation.invitation_last_name,
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li
              key={invitation.invitation_id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card-dense bg-surface-0 p-4"
            >
              <div className="flex min-w-0 flex-1 basis-56 flex-col">
                <span className="truncate text-app-subheading">
                  {name || invitation.invitation_email}
                </span>
                {name ? (
                  <span className="truncate text-app-caption text-text-secondary">
                    {invitation.invitation_email}
                  </span>
                ) : null}
              </div>
              {tone === 'neutral' ? (
                <Badge>{t(`statuses.${status}`)}</Badge>
              ) : (
                <StatusBadge status={tone}>
                  {t(`statuses.${status}`)}
                </StatusBadge>
              )}
              <span className="text-app-body-dense text-text-secondary">
                {t('expires')} {formatDate(invitation.invitation_expires_at)}
              </span>
              {canRevokeInvitation(invitation, instant) ? (
                <Button
                  variant="secondary"
                  aria-label={t('revokeLabel', {
                    email: invitation.invitation_email,
                  })}
                  disabled={revoking === invitation.invitation_id}
                  onClick={() => {
                    setRevoking(invitation.invitation_id);
                    startTransition(async () => {
                      const result = await revoke(invitation.invitation_id);
                      setError(
                        result.status === 'error'
                          ? (result.formError ?? 'unknown')
                          : null,
                      );
                      setRevoking(null);
                    });
                  }}
                >
                  {revoking === invitation.invitation_id
                    ? t('revoking')
                    : t('revoke')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
