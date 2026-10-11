'use client';

import {
  accessPolicyBounds,
  accessPolicyTemplates,
  diffPolicy,
  policyTemplates,
  validatePolicy,
} from '@domus/domain/access-policy';
import type {
  AccessPolicy,
  AccessPolicyRule,
  AccessPolicyTemplate,
  HouseholdAccessMode,
  VisitorType,
} from '@domus/domain/access-policy';
import { CircleAlert, CircleCheck, Lock, Save, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import {
  applyAccessPolicyTemplateAction,
  saveAccessPolicyAction,
} from '@/app/(app)/settings/access-policy/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  canClearMode,
  householdAccessModes,
  isLimitInRange,
  isModeSelectable,
  LIMIT_IDS,
  limitInputsOf,
  limitKeys,
  parseLimitInput,
  setDefaultMode,
  setIdentityRequired,
  toggleMode,
  visitorTypes,
  withLimitInputs,
} from '@/lib/access-policy/rules';
import type { LimitKey } from '@/lib/access-policy/rules';
import { useRunAction } from '@/lib/registry/use-run-action';
import { ChangeList } from './change-list';

/** Same grid on the column header and on every row, from `lg` up; below it each row is a stacked card. */
const ROW_GRID =
  'lg:grid-cols-[minmax(11rem,1.5fr)_repeat(4,minmax(6.5rem,1fr))_minmax(11rem,1.3fr)_minmax(10rem,1fr)]';

export interface PolicyEditorProps {
  /** The saved policy. */
  policy: AccessPolicy;
  /** Template the saved policy came from (`null` = edited by hand); `undefined` when the viewer may not know. */
  appliedTemplate: AccessPolicyTemplate | null | undefined;
  /** Changes whenever the saved policy does, so the draft restarts from what the database now holds. */
  version: string;
  canEdit: boolean;
}

/** M03-F01–F05: the access policy as a matrix of visitor types and modes, its limits and its templates. */
export function PolicyEditor({
  policy,
  appliedTemplate,
  version,
  canEdit,
}: PolicyEditorProps) {
  const t = useTranslations('accessPolicy');
  const [syncedVersion, setSyncedVersion] = useState(version);
  const [draft, setDraft] = useState(policy);
  const [inputs, setInputs] = useState(() => limitInputsOf(policy));
  const [previewing, setPreviewing] = useState<AccessPolicyTemplate | null>(
    null,
  );
  const action = useRunAction();
  const keys = useRef<{ fingerprint: string; id: string } | null>(null);

  // The saved policy changed (we saved, or the page refreshed): start again from it.
  if (syncedVersion !== version) {
    setSyncedVersion(version);
    setDraft(policy);
    setInputs(limitInputsOf(policy));
  }

  const candidate = withLimitInputs(draft, inputs);
  const valid = validatePolicy(candidate).success;
  const dirty = diffPolicy(policy, candidate).length > 0;

  /** One idempotency key per distinct change: a retry of the same change reuses it, a different change gets its own. */
  const keyFor = (fingerprint: string) => {
    if (keys.current?.fingerprint !== fingerprint)
      keys.current = { fingerprint, id: crypto.randomUUID() };
    return keys.current.id;
  };

  const updateRule = (
    visitor: VisitorType,
    change: (rule: AccessPolicyRule) => AccessPolicyRule,
  ) =>
    setDraft((current) => ({
      ...current,
      rules: { ...current.rules, [visitor]: change(current.rules[visitor]) },
    }));

  const discard = () => {
    setDraft(policy);
    setInputs(limitInputsOf(policy));
    action.clear();
  };

  const save = () =>
    action.run(() =>
      saveAccessPolicyAction(
        candidate,
        keyFor(`save:${JSON.stringify(candidate)}`),
      ),
    );

  const templateName = (code: AccessPolicyTemplate) =>
    t(`templates.names.${code}`);
  const errorText = (key: string) =>
    t.has(`errors.${key}` as 'errors.unknown')
      ? t(`errors.${key}` as 'errors.unknown')
      : t('errors.unknown');
  const noticeText = (key: string) =>
    t.has(`notices.${key}` as 'notices.saved')
      ? t(`notices.${key}` as 'notices.saved')
      : t('notices.saved');

  const previewPolicy = previewing ? policyTemplates[previewing] : null;
  const previewChanges = previewPolicy ? diffPolicy(policy, previewPolicy) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {!canEdit ? (
          <Badge
            tone="neutral"
            icon={<Lock aria-hidden="true" className="size-[1.25em]" />}
          >
            {t('readOnly')}
          </Badge>
        ) : null}
        {appliedTemplate !== undefined ? (
          <Badge tone="info">
            {appliedTemplate === null
              ? t('templates.custom')
              : `${t('templates.current')}: ${templateName(appliedTemplate)}`}
          </Badge>
        ) : null}
      </div>

      {action.error && previewing === null ? (
        <AuthNotice tone="error">{errorText(action.error)}</AuthNotice>
      ) : null}
      {action.notice && previewing === null ? (
        <AuthNotice tone="success">{noticeText(action.notice)}</AuthNotice>
      ) : null}

      {canEdit ? (
        <Card density="dense" className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h2 className="text-app-heading">{t('templates.title')}</h2>
            <InfoButton label={t('templates.infoLabel')}>
              {t('templates.info')}
            </InfoButton>
          </div>
          <ul
            aria-label={t('templates.listLabel')}
            className="flex flex-wrap gap-3"
          >
            {accessPolicyTemplates.map((code) => (
              <li key={code}>
                <Button
                  variant="secondary"
                  aria-label={t('templates.previewNamed', {
                    name: templateName(code),
                  })}
                  icon={
                    appliedTemplate === code ? (
                      <CircleCheck
                        aria-hidden="true"
                        className="size-5"
                        strokeWidth={2}
                      />
                    ) : undefined
                  }
                  onClick={() => {
                    action.clear();
                    setPreviewing(code);
                  }}
                >
                  {templateName(code)}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card density="dense" className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('matrix.title')}</h2>
          <InfoButton label={t('matrix.infoLabel')}>
            {t('matrix.info')}
          </InfoButton>
        </div>
        <div
          aria-hidden="true"
          className={`hidden gap-3 border-b border-hairline pb-2 text-app-caption text-text-secondary lg:grid ${ROW_GRID}`}
        >
          <span>{t('matrix.visitorType')}</span>
          {householdAccessModes.map((mode) => (
            <span key={mode} className="text-center">
              {t(`modes.${mode}`)}
            </span>
          ))}
          <span>{t('matrix.defaultMode')}</span>
          <span>{t('matrix.identity')}</span>
        </div>
        <div role="list" aria-label={t('matrix.listLabel')}>
          {visitorTypes.map((visitor) => (
            <MatrixRow
              key={visitor}
              visitor={visitor}
              rule={draft.rules[visitor]}
              disabled={!canEdit}
              onToggle={(mode, checked) =>
                updateRule(visitor, (rule) =>
                  toggleMode(rule, visitor, mode, checked),
                )
              }
              onDefault={(mode) =>
                updateRule(visitor, (rule) => setDefaultMode(rule, mode))
              }
              onIdentity={(required) =>
                updateRule(visitor, (rule) =>
                  setIdentityRequired(rule, required),
                )
              }
            />
          ))}
        </div>
      </Card>

      <Card density="dense" className="flex flex-col gap-4">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('limits.title')}</h2>
          <InfoButton label={t('limits.infoLabel')}>
            {t('limits.info')}
          </InfoButton>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {limitKeys.map((key) => (
            <LimitField
              key={key}
              limitKey={key}
              value={inputs[key]}
              disabled={!canEdit}
              onChange={(text) =>
                setInputs((current) => ({ ...current, [key]: text }))
              }
            />
          ))}
        </div>
      </Card>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!valid ? (
            <span className="flex items-center gap-2 text-app-body-dense text-danger">
              <CircleAlert
                aria-hidden="true"
                className="size-5 shrink-0"
                strokeWidth={2}
              />
              {t('actions.invalid')}
            </span>
          ) : dirty ? (
            <span className="text-app-body-dense text-text-secondary">
              {t('actions.unsaved')}
            </span>
          ) : null}
          <Button
            variant="secondary"
            icon={<Undo2 aria-hidden="true" className="size-5" />}
            disabled={!dirty || action.pending}
            onClick={discard}
          >
            {t('actions.discard')}
          </Button>
          <Button
            icon={<Save aria-hidden="true" className="size-5" />}
            disabled={!dirty || !valid || action.pending}
            onClick={save}
          >
            {action.pending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      ) : null}

      <Sheet
        open={previewing !== null}
        title={
          previewing
            ? t('templates.sheetTitle', { name: templateName(previewing) })
            : ''
        }
        closeLabel={t('templates.close')}
        onClose={() => setPreviewing(null)}
      >
        {previewing ? (
          <div className="flex flex-col gap-4">
            {dirty ? (
              <AuthNotice tone="info">
                {t('templates.discardsDraft')}
              </AuthNotice>
            ) : null}
            {action.error ? (
              <AuthNotice tone="error">{errorText(action.error)}</AuthNotice>
            ) : null}
            {previewChanges.length > 0 ? (
              <ChangeList
                changes={previewChanges}
                label={t('templates.changesLabel')}
              />
            ) : (
              <p className="text-app-body">{t('templates.noChanges')}</p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setPreviewing(null)}
                disabled={action.pending}
              >
                {t('templates.cancel')}
              </Button>
              <Button
                disabled={
                  action.pending ||
                  (previewChanges.length === 0 &&
                    appliedTemplate === previewing)
                }
                onClick={() =>
                  action.run(
                    () =>
                      applyAccessPolicyTemplateAction(
                        previewing,
                        keyFor(`template:${previewing}`),
                      ),
                    () => setPreviewing(null),
                  )
                }
              >
                {t('templates.apply')}
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

interface MatrixRowProps {
  visitor: VisitorType;
  rule: AccessPolicyRule;
  disabled: boolean;
  onToggle: (mode: HouseholdAccessMode, checked: boolean) => void;
  onDefault: (mode: HouseholdAccessMode) => void;
  onIdentity: (required: boolean) => void;
}

function MatrixRow({
  visitor,
  rule,
  disabled,
  onToggle,
  onDefault,
  onIdentity,
}: MatrixRowProps) {
  const t = useTranslations('accessPolicy');
  const nameId = `policy-row-${visitor}`;
  const allowed = rule.access_policy_rule_allowed_modes;
  return (
    <div
      role="group"
      aria-labelledby={nameId}
      className={`grid gap-x-3 gap-y-2 border-t border-hairline py-3 first:border-t-0 lg:items-center ${ROW_GRID}`}
    >
      <div className="flex items-center gap-1">
        <span id={nameId} className="text-app-subheading">
          {t(`visitorTypes.${visitor}`)}
        </span>
        {visitor === 'unknown' ? (
          <InfoButton label={t('matrix.unknownInfoLabel')}>
            {t('matrix.unknownInfo')}
          </InfoButton>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-4 lg:contents">
        {householdAccessModes.map((mode) => {
          const selectable = isModeSelectable(visitor, mode);
          const checked = allowed.includes(mode);
          return (
            <label
              key={mode}
              className="flex min-h-(--control-height) cursor-pointer items-center gap-2 text-app-body-dense has-disabled:cursor-not-allowed has-disabled:opacity-50 lg:justify-center"
            >
              <input
                type="checkbox"
                className="size-5 shrink-0 accent-accent"
                checked={checked}
                disabled={
                  disabled ||
                  !selectable ||
                  (checked && !canClearMode(rule, mode))
                }
                onChange={(event) => onToggle(mode, event.target.checked)}
              />
              <span className="lg:sr-only">{t(`modes.${mode}`)}</span>
            </label>
          );
        })}
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-app-caption text-text-secondary lg:sr-only">
          {t('matrix.defaultMode')}
        </span>
        <Select
          value={rule.access_policy_rule_default_mode}
          disabled={disabled}
          onChange={(event) =>
            onDefault(event.target.value as HouseholdAccessMode)
          }
        >
          {allowed.map((mode) => (
            <option key={mode} value={mode}>
              {t(`modes.${mode}`)}
            </option>
          ))}
        </Select>
      </label>
      <Switch
        label={t('matrix.identity')}
        className="lg:[&>span:last-child]:sr-only"
        checked={rule.access_policy_rule_is_identity_verification_required}
        disabled={disabled}
        onChange={(event) => onIdentity(event.target.checked)}
      />
    </div>
  );
}

function LimitField({
  limitKey,
  value,
  disabled,
  onChange,
}: {
  limitKey: LimitKey;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
}) {
  const t = useTranslations('accessPolicy.limits');
  const id = LIMIT_IDS[limitKey];
  const [min, max] = accessPolicyBounds[limitKey];
  const invalid = !isLimitInRange(limitKey, parseLimitInput(value));
  return (
    <Field
      label={t(`${id}.label`)}
      error={invalid ? t('range', { min, max }) : undefined}
    >
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          autoComplete="off"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1"
        />
        <span className="shrink-0 text-app-caption text-text-secondary">
          {t(`${id}.unit`)}
        </span>
      </div>
    </Field>
  );
}
