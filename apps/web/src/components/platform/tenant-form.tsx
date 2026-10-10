'use client';

import { slugify, timeZoneOptions } from '@domus/domain/platform';
import { tenantSubscriptionStatuses as statuses } from '@domus/domain/tenant/subscription-status';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { PlatformFormState } from '@/lib/platform/form-state';

type Action = (
  previous: PlatformFormState,
  formData: FormData,
) => Promise<PlatformFormState>;

export interface TenantFormProps {
  mode: 'create' | 'edit';
  action: Action;
  /** Current values when editing. */
  tenant?: {
    tenant_name: string;
    tenant_slug: string;
    tenant_address: string | null;
    tenant_time_zone: string;
  };
  /** Short-lived signed URL of the current logo (edit mode). */
  logoUrl?: string | null;
}

/** Name, identifier, address, time zone, (on creation) subscription and logo of a barrio. */
export function TenantForm({ mode, action, tenant, logoUrl }: TenantFormProps) {
  const t = useTranslations('platform.tenants');
  const errorsT = useTranslations('platform.tenants.errors');
  const statusT = useTranslations('platform.tenants.status');
  const { state, onSubmit, pending } = useSubmitAction(action);
  // One idempotency key per form instance: a retry after a lost answer cannot create the barrio twice.
  const [eventId] = useState(() => crypto.randomUUID());

  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const [name, setName] = useState(
    tenant?.tenant_name ?? values.tenant_name ?? '',
  );
  const [slug, setSlug] = useState(
    tenant?.tenant_slug ?? values.tenant_slug ?? '',
  );
  const [slugEdited, setSlugEdited] = useState(false);
  const fieldErrors = state.status === 'error' ? state.errors : {};
  const message = (key: string | undefined) =>
    key === undefined
      ? undefined
      : errorsT.has(key as 'unknown')
        ? errorsT(key as 'unknown')
        : errorsT('unknown');
  const zones = timeZoneOptions(tenant?.tenant_time_zone);

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
      aria-label={mode === 'create' ? t('form.create') : t('detail.dataTitle')}
    >
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      {state.status === 'success' && state.notice === 'saved' ? (
        <AuthNotice tone="success">{t('notices.saved')}</AuthNotice>
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Field label={t('form.name')} error={message(fieldErrors.tenant_name)}>
          <Input
            name="tenant_name"
            value={name}
            maxLength={200}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
              if (mode === 'create' && !slugEdited)
                setSlug(slugify(event.target.value));
            }}
          />
        </Field>

        {mode === 'create' ? (
          <Field
            label={t('form.slug')}
            info={{ label: t('form.slugInfoLabel'), text: t('form.slugInfo') }}
            error={message(fieldErrors.tenant_slug)}
          >
            <Input
              name="tenant_slug"
              value={slug}
              maxLength={100}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value);
              }}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-app-subheading">{t('detail.slugLabel')}</span>
            <p className="flex min-h-(--control-height) items-center text-app-body">
              {tenant?.tenant_slug}
            </p>
          </div>
        )}

        <Field
          label={t('form.address')}
          error={message(fieldErrors.tenant_address)}
        >
          <Input
            name="tenant_address"
            defaultValue={tenant?.tenant_address ?? values.tenant_address ?? ''}
            maxLength={500}
            autoComplete="off"
          />
        </Field>

        <Field
          label={t('form.timeZone')}
          error={message(fieldErrors.tenant_time_zone)}
        >
          <Select
            name="tenant_time_zone"
            defaultValue={
              tenant?.tenant_time_zone ?? values.tenant_time_zone ?? zones[0]
            }
          >
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace('America/', '').replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>

        {mode === 'create' ? (
          <Field
            label={t('form.status')}
            error={message(fieldErrors.tenant_subscription_status)}
          >
            <Select
              name="tenant_subscription_status"
              defaultValue={values.tenant_subscription_status ?? 'pilot'}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusT(status)}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label={t('form.logo')}
          info={{ label: t('form.logoInfoLabel'), text: t('form.logoInfo') }}
          error={message(fieldErrors.logo)}
        >
          <div className="flex flex-wrap items-center gap-4">
            {mode === 'edit' ? (
              logoUrl ? (
                // A short-lived signed URL of a private object: next/image cannot (and need not) optimize it.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={t('form.logoAlt', { name: tenant?.tenant_name ?? '' })}
                  className="size-16 rounded-card-dense bg-surface-2 object-contain"
                />
              ) : (
                <span className="text-app-body-dense text-text-secondary">
                  {t('form.logoNone')}
                </span>
              )
            ) : null}
            <Input
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="min-w-0 flex-1 py-2"
            />
          </div>
        </Field>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {mode === 'create'
            ? pending
              ? t('form.creating')
              : t('form.create')
            : pending
              ? t('form.saving')
              : t('form.save')}
        </Button>
        {mode === 'create' ? (
          <ButtonLink href="/platform/tenants" variant="secondary">
            {t('subscription.cancel')}
          </ButtonLink>
        ) : null}
      </div>
    </form>
  );
}
