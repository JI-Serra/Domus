'use client';

import { useTranslations } from 'next-intl';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { inviteGuardAction } from '@/app/(app)/registry/guards/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import { useEventId } from '@/lib/registry/use-event-id';
import { useErrorMessage } from './use-error-message';

/** Invites a guard by email (M02-F06). Retrying the same submission cannot send a second email. */
export function GuardInviteForm() {
  const t = useTranslations('registry.guards.invite');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(inviteGuardAction);
  const eventId = useEventId(state);
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
        <h2 className="text-app-heading">{t('title')}</h2>
        <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
      </div>
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      {state.status === 'success' ? (
        <AuthNotice tone="success">{t('sent')}</AuthNotice>
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label={t('firstName')} error={message(errors.first_name)}>
          <Input
            name="first_name"
            defaultValue={values.first_name ?? ''}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field label={t('lastName')} error={message(errors.last_name)}>
          <Input
            name="last_name"
            defaultValue={values.last_name ?? ''}
            maxLength={100}
            autoComplete="off"
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
