'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  requestMagicLinkAction,
  signInWithPasswordAction,
} from '@/app/(auth)/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { AuthErrorKey } from '@/lib/auth/errors';
import { INITIAL_AUTH_STATE } from '@/lib/auth/state';
import type { AuthFormState } from '@/lib/auth/state';
import { AuthNotice } from './auth-notice';

type Method = 'password' | 'magicLink';

/** Message for the form-level error, or undefined when the error belongs to a field (or there is none). */
function useFormError(state: AuthFormState, fallback?: AuthErrorKey) {
  const t = useTranslations('auth.errors');
  if (state.status === 'error' && state.field === 'form') return t(state.error);
  return fallback ? t(fallback) : undefined;
}

function useFieldError(
  state: AuthFormState,
  field: 'email' | 'password',
): string | undefined {
  const t = useTranslations('auth.errors');
  return state.status === 'error' && state.field === field
    ? t(state.error)
    : undefined;
}

function PasswordForm({
  next,
  initialError,
}: {
  next: string;
  initialError?: AuthErrorKey | undefined;
}) {
  const t = useTranslations('auth.login');
  const [state, action, pending] = useActionState(
    signInWithPasswordAction,
    INITIAL_AUTH_STATE,
  );
  const formError = useFormError(state, initialError);
  const emailError = useFieldError(state, 'email');
  const passwordError = useFieldError(state, 'password');

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}
      <input type="hidden" name="next" value={next} />
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
      <Field label={t('passwordLabel')} error={passwordError}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t('submittingPassword') : t('submitPassword')}
      </Button>
      <Link
        href="/forgot-password"
        className="inline-flex min-h-(--control-height) items-center justify-center text-app-body-dense text-info underline underline-offset-4"
      >
        {t('forgotPassword')}
      </Link>
    </form>
  );
}

function MagicLinkForm({ next }: { next: string }) {
  const t = useTranslations('auth.login');
  const [state, action, pending] = useActionState(
    requestMagicLinkAction,
    INITIAL_AUTH_STATE,
  );
  // "Usar otro email" hides the confirmation for the state it was shown for; the next submit produces a new state.
  const [dismissed, setDismissed] = useState<AuthFormState | null>(null);
  const formError = useFormError(state);
  const emailError = useFieldError(state, 'email');

  if (state.status === 'sent' && state !== dismissed) {
    return (
      <div className="flex flex-col gap-5">
        <AuthNotice tone="success" title={t('sentTitle')}>
          {t('sentBody', { email: state.email })}
        </AuthNotice>
        <Button variant="secondary" onClick={() => setDismissed(state)}>
          {t('useAnotherEmail')}
        </Button>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}
      <input type="hidden" name="next" value={next} />
      <Field label={t('emailLabel')} error={emailError}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={
            state.status === 'error' || state.status === 'sent'
              ? state.email
              : ''
          }
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? t('submittingMagicLink') : t('submitMagicLink')}
      </Button>
    </form>
  );
}

/** Sign-in: email + password, or a magic link sent by email as the alternative. */
export function LoginForm({
  next,
  initialError,
}: {
  /** Validated same-origin return path. */
  next: string;
  /** Error carried by the URL, e.g. an expired email link. */
  initialError?: AuthErrorKey | undefined;
}) {
  const t = useTranslations('auth.login');
  const [method, setMethod] = useState<Method>('password');

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl<Method>
        legend={t('methodLegend')}
        value={method}
        onChange={setMethod}
        options={[
          { value: 'password', label: t('methodPassword') },
          { value: 'magicLink', label: t('methodMagicLink') },
        ]}
      />
      {method === 'password' ? (
        <PasswordForm next={next} initialError={initialError} />
      ) : (
        <MagicLinkForm next={next} />
      )}
    </div>
  );
}
