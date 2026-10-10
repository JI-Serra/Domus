'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { acceptInvitationAction } from '@/app/(auth)/invitations/accept/actions';
import type { InvitationActionState } from '@/app/(auth)/invitations/accept/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { PrivacyNotice } from '@/components/privacy/privacy-notice';
import { Field, Input } from '@/components/ui/field';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/validation';

const IDLE: InvitationActionState = { status: 'idle' };

/** Confirmation of the invitation: what the visitor joins (tenant, role), an optional password, and the accept action. */
export function AcceptInvitationForm({
  token,
  tenantName,
  roleLabel,
  role,
}: {
  token: string;
  tenantName: string;
  roleLabel: string;
  /** Role of the invitation; residents get the privacy notice and land in their unit. */
  role?: string;
}) {
  const t = useTranslations('invitations.accept');
  const invitationErrors = useTranslations('invitations.accept.errors');
  const authErrors = useTranslations('auth.errors');
  const [state, action, pending] = useActionState(acceptInvitationAction, IDLE);

  const message = (field: 'password' | 'confirmPassword' | 'form') => {
    if (state.status !== 'error' || state.field !== field) return undefined;
    return state.scope === 'auth'
      ? authErrors.has(state.error as 'unknown')
        ? authErrors(state.error as 'unknown')
        : authErrors('unknown')
      : invitationErrors.has(state.error as 'unknown')
        ? invitationErrors(state.error as 'unknown')
        : invitationErrors('unknown');
  };
  const formError = message('form');

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      {role ? <input type="hidden" name="role" value={role} /> : null}
      <dl className="flex flex-col gap-3 rounded-card-dense bg-surface-0 p-4">
        <div className="flex flex-col">
          <dt className="text-app-caption text-text-secondary">
            {t('summary.tenant')}
          </dt>
          <dd className="text-app-heading">{tenantName}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-app-caption text-text-secondary">
            {t('summary.role')}
          </dt>
          <dd className="text-app-subheading">{roleLabel}</dd>
        </div>
      </dl>

      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}

      {role === 'unit_holder' || role === 'household_member' ? (
        <PrivacyNotice />
      ) : null}

      <Field
        label={t('password')}
        info={{ label: t('passwordInfoLabel'), text: t('passwordInfo') }}
        error={message('password')}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />
      </Field>
      <Field label={t('confirmPassword')} error={message('confirmPassword')}>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t('accepting') : t('accept')}
      </Button>
    </form>
  );
}
