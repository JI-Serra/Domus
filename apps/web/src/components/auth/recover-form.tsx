'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { requestPasswordResetAction } from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { INITIAL_AUTH_STATE } from '@/lib/auth/state';
import { AuthNotice } from './auth-notice';

const backLink =
  'inline-flex min-h-(--control-height) items-center justify-center text-app-body-dense text-info underline underline-offset-4';

/** Password recovery request. The confirmation never says whether the email has an account. */
export function RecoverForm() {
  const t = useTranslations('auth.recover');
  const errors = useTranslations('auth.errors');
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    INITIAL_AUTH_STATE,
  );

  if (state.status === 'sent') {
    return (
      <div className="flex flex-col gap-5">
        <AuthNotice tone="success" title={t('sentTitle')}>
          {t('sentBody', { email: state.email })}
        </AuthNotice>
        <Link href="/ingresar" className={backLink}>
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  const emailError =
    state.status === 'error' && state.field === 'email'
      ? errors(state.error)
      : undefined;
  const formError =
    state.status === 'error' && state.field === 'form'
      ? errors(state.error)
      : undefined;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}
      <Field label={t('emailLabel')} error={emailError}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.status === 'error' ? state.email : ''}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
      <Link href="/ingresar" className={backLink}>
        {t('backToLogin')}
      </Link>
    </form>
  );
}
