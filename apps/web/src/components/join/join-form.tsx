'use client';

import { formatJoinCodeInput } from '@domus/domain/household';
import { CircleCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { submitJoinRequestAction } from '@/app/(account)/join/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { PrivacyNotice } from '@/components/privacy/privacy-notice';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { useSubmitAction } from '@/lib/platform/use-submit-action';

/** Unit code + minimum personal data (D22). A sent request shows its status instead of the form. */
export function JoinForm() {
  const t = useTranslations('join');
  const { state, onSubmit, pending } = useSubmitAction(submitJoinRequestAction);
  // One key per submission: a retry after a lost answer is the same request, not a second one.
  const [eventId, setEventId] = useState(() => crypto.randomUUID());
  const [dismissed, setDismissed] = useState<typeof state | null>(null);
  const [code, setCode] = useState('');
  const sent = state.status === 'success' && dismissed !== state;

  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const message = (key: string | undefined) =>
    key === undefined
      ? undefined
      : t.has(`errors.${key}` as 'errors.unknown')
        ? t(`errors.${key}` as 'errors.unknown')
        : t('errors.unknown');

  if (sent)
    return (
      <Card density="dense" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CircleCheck
            aria-hidden="true"
            className="size-6 shrink-0 text-success"
            strokeWidth={2}
          />
          <h2 className="text-app-heading">{t('sent.title')}</h2>
        </div>
        <div>
          <StatusBadge status="warning">{t('sent.status')}</StatusBadge>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setDismissed(state);
              setEventId(crypto.randomUUID());
              setCode('');
            }}
          >
            {t('sent.another')}
          </Button>
        </div>
      </Card>
    );

  return (
    <Card density="dense" className="flex flex-col gap-5">
      <h2 className="text-app-heading">{t('title')}</h2>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {state.status === 'error' && state.formError ? (
          <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
        ) : null}
        <input type="hidden" name="client_event_id" value={eventId} />
        <Field
          label={t('code')}
          info={{ label: t('codeInfoLabel'), text: t('codeInfo') }}
          error={message(errors.join_code)}
        >
          <Input
            name="join_code"
            value={code}
            onChange={(event) =>
              setCode(formatJoinCodeInput(event.target.value))
            }
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            className="tnum tracking-wider uppercase"
            placeholder="XXXX-XXXX-XXXX"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('firstName')}
            error={message(errors.person_first_name)}
          >
            <Input
              name="person_first_name"
              defaultValue={values.person_first_name ?? ''}
              autoComplete="given-name"
              maxLength={100}
            />
          </Field>
          <Field label={t('lastName')} error={message(errors.person_last_name)}>
            <Input
              name="person_last_name"
              defaultValue={values.person_last_name ?? ''}
              autoComplete="family-name"
              maxLength={100}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('documentType')}
            info={{
              label: t('documentInfoLabel'),
              text: t('documentInfo'),
            }}
            error={message(errors.person_document_type)}
          >
            <Select
              name="person_document_type"
              defaultValue={values.person_document_type ?? ''}
            >
              <option value="">{t('documentTypes.none')}</option>
              <option value="dni">{t('documentTypes.dni')}</option>
              <option value="passport">{t('documentTypes.passport')}</option>
              <option value="other">{t('documentTypes.other')}</option>
            </Select>
          </Field>
          <Field
            label={t('documentNumber')}
            error={message(errors.person_document_number)}
          >
            <Input
              name="person_document_number"
              defaultValue={values.person_document_number ?? ''}
              autoComplete="off"
              maxLength={32}
              inputMode="text"
            />
          </Field>
        </div>
        <PrivacyNotice />
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Card>
  );
}
