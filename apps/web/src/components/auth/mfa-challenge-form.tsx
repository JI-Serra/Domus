'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { verifyMfaChallengeAction } from '@/app/(auth)/login/mfa/actions';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/field';
import { INITIAL_CODE_STATE } from '@/lib/auth/mfa-state';
import type { VerifiedFactor } from '@/lib/auth/mfa';
import { AuthNotice } from './auth-notice';
import { MfaCodeField, useCodeFormError } from './mfa-code-field';

/**
 * Second step of the sign-in: the six-digit code of the user's authenticator app. With several enrolled factors the
 * user also picks which one they are answering.
 */
export function MfaChallengeForm({
  factors,
  next,
}: {
  factors: readonly VerifiedFactor[];
  /** Validated same-origin return path. */
  next: string;
}) {
  const t = useTranslations('auth.mfa');
  const [state, action, pending] = useActionState(
    verifyMfaChallengeAction,
    INITIAL_CODE_STATE,
  );
  const formError = useCodeFormError(state);
  const [first] = factors;

  return (
    <form action={action} noValidate className="flex flex-col gap-5">
      {formError ? <AuthNotice tone="error">{formError}</AuthNotice> : null}
      <input type="hidden" name="next" value={next} />
      {factors.length > 1 ? (
        <Field label={t('factorLabel')}>
          <Select name="factorId" defaultValue={first?.id}>
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <input type="hidden" name="factorId" value={first?.id ?? ''} />
      )}
      <MfaCodeField state={state} autoFocus />
      <Button type="submit" disabled={pending}>
        {pending ? t('verifying') : t('verify')}
      </Button>
    </form>
  );
}
