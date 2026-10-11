'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { OneTimeSecret } from '@/components/ui/one-time-secret';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { inviteResidentAction } from '@/app/(app)/registry/units/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import { useEventId } from '@/lib/registry/use-event-id';
import { useOnSuccess } from '@/lib/registry/use-on-success';
import { useErrorMessage } from './use-error-message';

type Mode = 'email' | 'link';

/**
 * Invite a resident to open an account: by email, or as a one-time link to hand over by other means. Minors are never
 * offered this (the caller hides the action) and the database refuses them as well. The link is shown once.
 */
export function InviteResidentForm({
  unitId,
  personId,
  email,
  isHolder,
  onClose,
}: {
  unitId: string;
  personId: string;
  email: string;
  isHolder: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('registry.residents.invite');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    inviteResidentAction.bind(null, unitId, personId),
  );
  const eventId = useEventId(state);
  const [mode, setMode] = useState<Mode>('email');
  // Email delivery closes the sheet; a link stays on screen until it is dismissed.
  useOnSuccess(state, (success) => {
    if (!success.value) onClose();
  });
  const errors = state.status === 'error' ? state.errors : {};

  if (state.status === 'success' && state.value)
    return (
      <div className="flex flex-col gap-4">
        <OneTimeSecret
          label={t('linkTitle')}
          value={state.value}
          copyLabel={t('copy')}
          copiedLabel={t('copied')}
          info={{ label: t('linkInfoLabel'), text: t('linkInfo') }}
        />
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('done')}
          </Button>
        </div>
      </div>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="client_event_id" value={eventId} />
      <input type="hidden" name="mode" value={mode} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <Field label={t('email')} error={message(errors.invited_email)}>
        <Input
          name="invited_email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={email}
        />
      </Field>
      <Field
        label={t('role')}
        info={{ label: t('roleInfoLabel'), text: t('roleInfo') }}
        error={message(errors.target_role)}
      >
        <Select
          name="target_role"
          defaultValue={isHolder ? 'unit_holder' : 'household_member'}
        >
          <option value="household_member">{t('member')}</option>
          <option value="unit_holder">{t('holder')}</option>
        </Select>
      </Field>
      <div className="flex items-end gap-1">
        <SegmentedControl
          className="flex-1"
          legend={t('mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'email', label: t('modeEmail') },
            { value: 'link', label: t('modeLink') },
          ]}
        />
        <InfoButton label={t('modeInfoLabel')}>{t('modeInfo')}</InfoButton>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('sending') : mode === 'email' ? t('send') : t('create')}
        </Button>
      </div>
    </form>
  );
}
