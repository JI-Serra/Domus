'use client';

import { useTranslations } from 'next-intl';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { Switch } from '@/components/ui/switch';
import { saveResidentAction } from '@/app/(app)/registry/units/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { UnitSheet } from '@/lib/registry/data';
import { useEventId } from '@/lib/registry/use-event-id';
import { useOnSuccess } from '@/lib/registry/use-on-success';
import { useErrorMessage } from './use-error-message';

type Resident = UnitSheet['residents'][number];

const RELATIONSHIPS = ['owner', 'tenant', 'family', 'other'] as const;

/** Add a resident or edit one (relationship, holder, minor). The holder rule is enforced by the database. */
export function ResidentForm({
  unitId,
  resident,
  onDone,
}: {
  unitId: string;
  resident?: Resident;
  onDone: () => void;
}) {
  const t = useTranslations('registry.residents.form');
  const relationshipT = useTranslations('registry.residents.relationship');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    saveResidentAction.bind(null, unitId, resident?.person_id ?? null),
  );
  const eventId = useEventId(state);
  useOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const value = (name: string, stored?: string | null) =>
    values[name] ?? stored ?? '';
  const checked = (name: string, stored: boolean | undefined) =>
    state.status === 'error' ? values[name] === 'on' : (stored ?? false);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="client_event_id" value={eventId} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('firstName')} error={message(errors.person_first_name)}>
          <Input
            name="person_first_name"
            defaultValue={value(
              'person_first_name',
              resident?.person_first_name,
            )}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field label={t('lastName')} error={message(errors.person_last_name)}>
          <Input
            name="person_last_name"
            defaultValue={value('person_last_name', resident?.person_last_name)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field
          label={t('documentType')}
          error={message(errors.person_document_type)}
        >
          <Select
            name="person_document_type"
            defaultValue={value(
              'person_document_type',
              resident ? (resident.person_document_type ?? '') : 'dni',
            )}
          >
            <option value="">{t('noDocument')}</option>
            <option value="dni">{t('dni')}</option>
            <option value="passport">{t('passport')}</option>
            <option value="other">{t('otherDocument')}</option>
          </Select>
        </Field>
        <Field
          label={t('documentNumber')}
          error={message(errors.person_document_number)}
        >
          <Input
            name="person_document_number"
            defaultValue={value(
              'person_document_number',
              resident?.person_document_number,
            )}
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
        <Field label={t('email')} error={message(errors.person_email)}>
          <Input
            name="person_email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={value('person_email', resident?.person_email)}
          />
        </Field>
        <Field label={t('phone')} error={message(errors.person_phone)}>
          <Input
            name="person_phone"
            type="tel"
            defaultValue={value('person_phone', resident?.person_phone)}
            autoComplete="off"
          />
        </Field>
        <Field
          label={t('birthDate')}
          info={{ label: t('birthDateInfoLabel'), text: t('birthDateInfo') }}
          error={message(errors.person_birth_date)}
        >
          <Input
            name="person_birth_date"
            type="date"
            defaultValue={value(
              'person_birth_date',
              resident?.person_birth_date,
            )}
          />
        </Field>
        <Field
          label={t('relationship')}
          error={message(errors.unit_resident_relationship)}
        >
          <Select
            name="unit_resident_relationship"
            defaultValue={value(
              'unit_resident_relationship',
              resident?.unit_resident_relationship ?? 'family',
            )}
          >
            {RELATIONSHIPS.map((option) => (
              <option key={option} value={option}>
                {relationshipT(option)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset className="flex min-w-0 flex-col gap-1">
        <legend className="mb-1 flex items-center gap-1 text-app-subheading">
          {t('flags')}
          <InfoButton label={t('flagsInfoLabel')}>{t('flagsInfo')}</InfoButton>
        </legend>
        <Switch
          name="unit_resident_is_holder"
          label={t('holder')}
          defaultChecked={checked(
            'unit_resident_is_holder',
            resident?.unit_resident_is_holder,
          )}
        />
        {errors.unit_resident_is_holder ? (
          <p className="text-app-caption text-danger">
            {message(errors.unit_resident_is_holder)}
          </p>
        ) : null}
        <Switch
          name="unit_resident_is_minor"
          label={t('minor')}
          defaultChecked={checked(
            'unit_resident_is_minor',
            resident?.unit_resident_is_minor,
          )}
        />
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : resident ? t('save') : t('add')}
        </Button>
      </div>
    </form>
  );
}
