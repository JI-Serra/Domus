'use client';

import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { redeemPairingAction } from '@/app/(app)/devices/pair/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import { useErrorMessage } from './use-error-message';

/**
 * Tablet side of the pairing (M02-F07): a guard or administrator, signed in on the tablet, types the code shown in
 * Puestos. One uniform message covers a wrong, expired or already used code.
 */
export function PairDeviceForm() {
  const t = useTranslations('devices.pair');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(redeemPairingAction);
  const [done, setDone] = useState(false);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  if (state.status === 'success' || done)
    return (
      <div className="flex flex-col gap-4">
        <p
          role="status"
          data-testid="pair-success"
          className="flex items-center gap-2 text-app-heading text-success"
        >
          <CircleCheck aria-hidden="true" className="size-6" strokeWidth={2} />
          {t('success', {
            name: state.status === 'success' ? (state.value ?? '') : '',
          })}
        </p>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setDone(false);
              window.location.reload();
            }}
          >
            {t('another')}
          </Button>
        </div>
      </div>
    );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex max-w-xl flex-col gap-4"
    >
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <Field label={t('deviceName')} error={message(errors.device_name)}>
        <Input
          name="device_name"
          defaultValue={values.device_name ?? ''}
          maxLength={100}
          autoComplete="off"
          className="min-h-(--touch-garita)"
        />
      </Field>
      <Field
        label={t('code')}
        info={{ label: t('codeInfoLabel'), text: t('codeInfo') }}
        error={message(errors.pairing_code)}
      >
        <Input
          name="pairing_code"
          defaultValue={values.pairing_code ?? ''}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          className="min-h-(--touch-garita) font-mono tracking-wider"
        />
      </Field>
      <div className="flex items-center gap-1">
        <Button type="submit" size="gate" disabled={pending}>
          {pending ? t('pairing') : t('submit')}
        </Button>
        <InfoButton label={t('storedInfoLabel')}>{t('storedInfo')}</InfoButton>
      </div>
    </form>
  );
}
