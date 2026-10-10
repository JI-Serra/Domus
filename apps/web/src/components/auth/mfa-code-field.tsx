'use client';

import { useTranslations } from 'next-intl';
import { Field, Input } from '@/components/ui/field';
import type { CodeFormState } from '@/lib/auth/mfa-state';

/** The six-digit code input shared by the challenge and the enrollment verification. */
export function MfaCodeField({
  state,
  autoFocus = false,
}: {
  state: CodeFormState;
  autoFocus?: boolean;
}) {
  const t = useTranslations('auth.mfa');
  const errors = useTranslations('auth.errors');
  const error =
    state.status === 'error' && state.field === 'code'
      ? errors(state.error)
      : undefined;
  return (
    <Field label={t('codeLabel')} error={error}>
      <Input
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        autoFocus={autoFocus}
        spellCheck={false}
        className="tnum tracking-[0.3em]"
      />
    </Field>
  );
}

/** Form-level message of a code form (the errors that do not belong to the code field). */
export function useCodeFormError(state: CodeFormState): string | undefined {
  const errors = useTranslations('auth.errors');
  return state.status === 'error' && state.field === 'form'
    ? errors(state.error)
    : undefined;
}
