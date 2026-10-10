'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { updatePasswordAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/validation';
import { INITIAL_AUTH_STATE } from '@/lib/auth/state';
import { AuthNotice } from './auth-notice';

/** Sets the new password for the recovery session opened by the email link. */
export function ResetForm() {
  const t = useTranslations('auth.reset');
  const errors = useTranslations('auth.errors');
  const [state, action, pending] = useActionState(
    updatePasswordAction,
    INITIAL_AUTH_STATE,
  );
  const errorFor = (field: 'password' | 'confirmPassword' | 'form') =>
    state.status === 'error' && state.field === field
      ? errors(state.error)
      : undefined;
  const formError = errorFor('form');

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}
      <Field
        label={t('passwordLabel')}
        info={{ label: t('passwordInfoLabel'), text: t('passwordInfo') }}
        error={errorFor('password')}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
        />
      </Field>
      <Field label={t('confirmLabel')} error={errorFor('confirmPassword')}>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
