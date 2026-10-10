'use client';

import { billableToChoice } from '@domus/domain/registry-ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import { useEventId } from '@/lib/registry/use-event-id';
import { useErrorMessage } from './use-error-message';

type Action = (
  previous: PlatformFormState,
  formData: FormData,
) => Promise<PlatformFormState>;

const STATUSES = ['occupied', 'under_construction', 'vacant'] as const;

export interface UnitFormProps {
  action: Action;
  /** Present when editing. */
  unit?: {
    unit_id: string;
    unit_code: string;
    unit_block_code: string | null;
    unit_lot_number: string | null;
    unit_status: (typeof STATUSES)[number];
    unit_coefficient: number;
    unit_is_billable: boolean | null;
    unit_contact_phone: string | null;
    unit_backup_phone: string | null;
  };
  cancelHref: string;
}

/** Create / edit a unit (M02-F01). An occupied unit is created together with its first holder. */
export function UnitForm({ action, unit, cancelHref }: UnitFormProps) {
  const t = useTranslations('registry.units.form');
  const statusT = useTranslations('unitStatus');
  const billableT = useTranslations('registry.units.billable');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(action);
  const eventId = useEventId(state);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const [status, setStatus] = useState<string>(
    values.unit_status ?? unit?.unit_status ?? 'vacant',
  );
  const creating = !unit;
  const value = (name: string, stored?: string | null) =>
    values[name] ?? stored ?? '';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="client_event_id" value={eventId} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field label={t('code')} error={message(errors.unit_code)}>
          <Input
            name="unit_code"
            defaultValue={value('unit_code', unit?.unit_code)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field label={t('block')} error={message(errors.unit_block_code)}>
          <Input
            name="unit_block_code"
            defaultValue={value('unit_block_code', unit?.unit_block_code)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field label={t('lot')} error={message(errors.unit_lot_number)}>
          <Input
            name="unit_lot_number"
            defaultValue={value('unit_lot_number', unit?.unit_lot_number)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Field label={t('status')} error={message(errors.unit_status)}>
          <Select
            name="unit_status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {statusT(option)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('coefficient')}
          error={message(errors.unit_coefficient)}
        >
          <Input
            name="unit_coefficient"
            inputMode="decimal"
            defaultValue={value(
              'unit_coefficient',
              unit ? String(unit.unit_coefficient) : '1',
            )}
            autoComplete="off"
          />
        </Field>
        <Field
          label={t('billable')}
          info={{ label: t('billableInfoLabel'), text: t('billableInfo') }}
          error={message(errors.unit_is_billable)}
        >
          <Select
            name="unit_is_billable"
            defaultValue={value(
              'unit_is_billable',
              billableToChoice(unit?.unit_is_billable ?? null),
            )}
          >
            <option value="inherit">{billableT('inherit')}</option>
            <option value="yes">{billableT('yes')}</option>
            <option value="no">{billableT('no')}</option>
          </Select>
        </Field>
        <Field
          label={t('contactPhone')}
          error={message(errors.unit_contact_phone)}
        >
          <Input
            name="unit_contact_phone"
            type="tel"
            defaultValue={value('unit_contact_phone', unit?.unit_contact_phone)}
            autoComplete="off"
          />
        </Field>
        <Field
          label={t('backupPhone')}
          error={message(errors.unit_backup_phone)}
        >
          <Input
            name="unit_backup_phone"
            type="tel"
            defaultValue={value('unit_backup_phone', unit?.unit_backup_phone)}
            autoComplete="off"
          />
        </Field>
      </div>

      {creating && status === 'occupied' ? (
        <fieldset className="flex min-w-0 flex-col gap-4">
          <legend className="mb-3 flex items-center gap-1 text-app-subheading">
            {t('holderLegend')}
            <InfoButton label={t('holderInfoLabel')}>
              {t('holderInfo')}
            </InfoButton>
          </legend>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label={t('holderFirstName')}
              error={message(errors.holder_person_first_name)}
            >
              <Input
                name="holder_person_first_name"
                defaultValue={value('holder_person_first_name')}
                autoComplete="off"
              />
            </Field>
            <Field
              label={t('holderLastName')}
              error={message(errors.holder_person_last_name)}
            >
              <Input
                name="holder_person_last_name"
                defaultValue={value('holder_person_last_name')}
                autoComplete="off"
              />
            </Field>
            <Field
              label={t('holderDocumentType')}
              error={message(errors.holder_person_document_type)}
            >
              <Select
                name="holder_person_document_type"
                defaultValue={value('holder_person_document_type', 'dni')}
              >
                <option value="">{t('noDocument')}</option>
                <option value="dni">{t('dni')}</option>
                <option value="passport">{t('passport')}</option>
                <option value="other">{t('otherDocument')}</option>
              </Select>
            </Field>
            <Field
              label={t('holderDocumentNumber')}
              error={message(errors.holder_person_document_number)}
            >
              <Input
                name="holder_person_document_number"
                defaultValue={value('holder_person_document_number')}
                inputMode="numeric"
                autoComplete="off"
              />
            </Field>
            <Field
              label={t('holderEmail')}
              error={message(errors.holder_person_email)}
              className="md:col-span-2"
            >
              <Input
                name="holder_person_email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={value('holder_person_email')}
              />
            </Field>
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : creating ? t('create') : t('save')}
        </Button>
        <ButtonLink href={cancelHref} variant="secondary">
          {t('cancel')}
        </ButtonLink>
      </div>
    </form>
  );
}
