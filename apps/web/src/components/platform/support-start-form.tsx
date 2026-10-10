'use client';

import {
  SUPPORT_DEFAULT_MINUTES,
  SUPPORT_MAX_MINUTES,
} from '@domus/domain/platform';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { PlatformFormState } from '@/lib/platform/form-state';
import type {
  SupportTarget,
  SupportTargetsResult,
} from '@/app/platform/support/actions';

const SEARCH_DELAY_MS = 300;

export interface SupportTenantOption {
  tenant_id: string;
  tenant_name: string;
}

/** One entry per person, with all their active roles in the barrio. */
function groupTargets(targets: readonly SupportTarget[]) {
  const people = new Map<
    string,
    { user_id: string; name: string; roles: SupportTarget['membership_role'][] }
  >();
  for (const target of targets) {
    const person = people.get(target.user_id) ?? {
      user_id: target.user_id,
      name: `${target.person_first_name} ${target.person_last_name}`.trim(),
      roles: [],
    };
    person.roles.push(target.membership_role);
    people.set(target.user_id, person);
  }
  return [...people.values()];
}

/**
 * Starts a support session: barrio → person of that barrio, a required reason and a duration (default 30, up to
 * 60 minutes). People are looked up on the server on demand (each lookup is audited), never preloaded.
 */
export function SupportStartForm({
  tenants,
  lookup,
  action,
}: {
  tenants: readonly SupportTenantOption[];
  lookup: (tenantId: string, search: string) => Promise<SupportTargetsResult>;
  action: (
    previous: PlatformFormState,
    formData: FormData,
  ) => Promise<PlatformFormState>;
}) {
  const t = useTranslations('platform.support.start');
  const errorsT = useTranslations('platform.support.errors');
  const rolesT = useTranslations('roles');
  const { state, onSubmit, pending } = useSubmitAction(action);
  const [eventId] = useState(() => crypto.randomUUID());
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  const [tenantId, setTenantId] = useState(values.target_tenant_id ?? '');
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState(values.target_user_id ?? '');
  const [targets, setTargets] = useState<SupportTarget[]>([]);
  const [lookupState, setLookupState] = useState<
    'idle' | 'loading' | 'done' | 'failed'
  >('idle');
  const requestId = useRef(0);

  useEffect(() => {
    if (!tenantId) return;
    const current = ++requestId.current;
    const timer = setTimeout(async () => {
      setLookupState('loading');
      const result = await lookup(tenantId, search);
      // Only the newest request may write: an older answer would show people of the previous barrio.
      if (current !== requestId.current) return;
      if (result.ok) {
        setTargets(result.targets);
        setLookupState('done');
      } else {
        setTargets([]);
        setLookupState('failed');
      }
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [tenantId, search, lookup]);

  const people = groupTargets(targets);
  const message = (key: string | undefined) =>
    key === undefined
      ? undefined
      : errorsT.has(key as 'unknown')
        ? errorsT(key as 'unknown')
        : errorsT('unknown');
  const listError =
    lookupState === 'failed' ? message('lookupFailed') : undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex items-center gap-1">
        <h2 className="text-app-heading">{t('title')}</h2>
        <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
      </div>
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />

      <div className="grid gap-5 lg:grid-cols-3">
        <Field label={t('tenant')} error={message(errors.target_tenant_id)}>
          <Select
            name="target_tenant_id"
            value={tenantId}
            onChange={(event) => {
              setTenantId(event.target.value);
              setUserId('');
              setTargets([]);
              setSearch('');
              setLookupState(event.target.value ? 'loading' : 'idle');
            }}
          >
            <option value="">{t('tenantPlaceholder')}</option>
            {tenants.map((tenant) => (
              <option key={tenant.tenant_id} value={tenant.tenant_id}>
                {tenant.tenant_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('search')}>
          <Input
            type="search"
            value={search}
            placeholder={t('searchPlaceholder')}
            autoComplete="off"
            maxLength={100}
            disabled={!tenantId}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Field
          label={t('user')}
          error={listError ?? message(errors.target_user_id)}
        >
          <Select
            name="target_user_id"
            value={userId}
            disabled={!tenantId}
            onChange={(event) => setUserId(event.target.value)}
          >
            <option value="">
              {lookupState === 'loading'
                ? t('loading')
                : lookupState === 'done' && people.length === 0
                  ? t('noTargets')
                  : t('userPlaceholder')}
            </option>
            {people.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {`${person.name} · ${person.roles.map((role) => rolesT(role)).join(', ')}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Field label={t('reason')} error={message(errors.reason)}>
          <Textarea
            name="reason"
            defaultValue={values.reason ?? ''}
            maxLength={500}
            rows={3}
          />
        </Field>
        <Field
          label={t('duration')}
          info={{ label: t('durationInfoLabel'), text: t('durationInfo') }}
          error={message(errors.duration_minutes)}
        >
          <Input
            name="duration_minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={SUPPORT_MAX_MINUTES}
            defaultValue={values.duration_minutes ?? SUPPORT_DEFAULT_MINUTES}
          />
        </Field>
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
