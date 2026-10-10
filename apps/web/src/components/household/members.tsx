'use client';

import { formatDate } from '@domus/domain/format';
import { togglePermission } from '@domus/domain/household';
import type { HouseholdPermission } from '@domus/domain/household';
import {
  householdPermissions,
  residentRelationships,
} from '@domus/domain/registry';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  addMemberAction,
  endMembershipAction,
  inviteResidentAction,
  resendInvitationAction,
  revokeInvitationAction,
  setPermissionsAction,
  updateMemberAction,
} from '@/app/(app)/home/actions';
import { AuthNotice } from '@/components/auth/auth-notice';
import { useTenantWritable } from '@/components/tenant/tenant-status';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import type { MemberView } from '@/lib/household/view';
import { noticeOf, useActionRunner, useErrorMessage } from './notice';
import { ActionNotice } from './notice';
import type { Notice } from './notice';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import { UsersRound } from 'lucide-react';

const fullName = (member: Pick<MemberView, 'firstName' | 'lastName'>) =>
  `${member.firstName} ${member.lastName}`.trim();

function useRelationshipOptions() {
  const t = useTranslations('household.relationship');
  return residentRelationships.map((value) => ({ value, label: t(value) }));
}

interface FormProps {
  onDone: (notice: Notice | null) => void;
  onCancel: () => void;
}

/** Closes the sheet once the action succeeded, handing the confirmation to the section. */
function useCloseOnSuccess(
  state: ReturnType<typeof useSubmitAction>['state'],
  onDone: FormProps['onDone'],
) {
  useEffect(() => {
    if (state.status === 'success') onDone(noticeOf(state));
    // `onDone` only closes the sheet; the success state is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function FormActions({
  pending,
  submitLabel,
  pendingLabel,
  onCancel,
}: {
  pending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onCancel: () => void;
}) {
  const t = useTranslations('household');
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {t('cancel')}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}

function FormError({ formError }: { formError: string | undefined }) {
  const message = useErrorMessage();
  return formError ? (
    <AuthNotice tone="error">{message(formError)}</AuthNotice>
  ) : null;
}

function AddMemberForm({ onDone, onCancel }: FormProps) {
  const t = useTranslations('household');
  const message = useErrorMessage();
  const relationships = useRelationshipOptions();
  const { state, onSubmit, pending } = useSubmitAction(addMemberAction);
  // One key per step: retrying after a failed delivery neither duplicates the resident nor the email.
  const [eventId] = useState(() => crypto.randomUUID());
  const [invitationEventId] = useState(() => crypto.randomUUID());
  const [isMinor, setIsMinor] = useState(false);
  useCloseOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError
        formError={state.status === 'error' ? state.formError : undefined}
      />
      <input type="hidden" name="client_event_id" value={eventId} />
      <input
        type="hidden"
        name="invitation_event_id"
        value={invitationEventId}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('fields.firstName')}
          error={message(errors.person_first_name)}
        >
          <Input
            name="person_first_name"
            defaultValue={values.person_first_name ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field
          label={t('fields.lastName')}
          error={message(errors.person_last_name)}
        >
          <Input
            name="person_last_name"
            defaultValue={values.person_last_name ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
      </div>
      <Field
        label={t('fields.relationship')}
        error={message(errors.unit_resident_relationship)}
      >
        <Select
          name="unit_resident_relationship"
          defaultValue={values.unit_resident_relationship ?? 'family'}
        >
          {relationships.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Switch
        name="is_minor"
        label={t('fields.minor')}
        checked={isMinor}
        onChange={(event) => setIsMinor(event.target.checked)}
      />
      {isMinor ? null : (
        <Field
          label={t('fields.email')}
          info={{
            label: t('members.addInfoLabel'),
            text: t('members.addInfo'),
          }}
          error={message(errors.person_email)}
        >
          <Input
            name="person_email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.person_email ?? ''}
          />
        </Field>
      )}
      <FormActions
        pending={pending}
        submitLabel={isMinor ? t('save') : t('members.send')}
        pendingLabel={isMinor ? t('saving') : t('members.sending')}
        onCancel={onCancel}
      />
    </form>
  );
}

function EditMemberForm({
  member,
  onDone,
  onCancel,
}: FormProps & { member: MemberView }) {
  const t = useTranslations('household');
  const message = useErrorMessage();
  const relationships = useRelationshipOptions();
  const { state, onSubmit, pending } = useSubmitAction(
    updateMemberAction.bind(null, member.personId),
  );
  useCloseOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const hasAccount = member.standing === 'member';

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError
        formError={state.status === 'error' ? state.formError : undefined}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('fields.firstName')}
          error={message(errors.person_first_name)}
        >
          <Input
            name="person_first_name"
            defaultValue={values.person_first_name ?? member.firstName}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field
          label={t('fields.lastName')}
          error={message(errors.person_last_name)}
        >
          <Input
            name="person_last_name"
            defaultValue={values.person_last_name ?? member.lastName}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('fields.relationship')}
          error={message(errors.unit_resident_relationship)}
        >
          <Select
            name="unit_resident_relationship"
            defaultValue={
              values.unit_resident_relationship ?? member.relationship
            }
          >
            {relationships.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label={t('fields.birthDate')}
          error={message(errors.person_birth_date)}
        >
          <Input
            name="person_birth_date"
            type="date"
            defaultValue={values.person_birth_date ?? member.birthDate ?? ''}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('fields.email')}
          info={
            hasAccount
              ? {
                  label: t('members.emailInfoLabel'),
                  text: t('members.emailLocked'),
                }
              : undefined
          }
          error={message(errors.person_email)}
        >
          <Input
            name="person_email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={hasAccount}
            defaultValue={values.person_email ?? member.email ?? ''}
          />
        </Field>
        <Field label={t('fields.phone')} error={message(errors.person_phone)}>
          <Input
            name="person_phone"
            type="tel"
            inputMode="tel"
            defaultValue={values.person_phone ?? member.phone ?? ''}
            maxLength={32}
          />
        </Field>
      </div>
      <FormActions
        pending={pending}
        submitLabel={t('save')}
        pendingLabel={t('saving')}
        onCancel={onCancel}
      />
    </form>
  );
}

function InviteMemberForm({
  member,
  onDone,
  onCancel,
}: FormProps & { member: MemberView }) {
  const t = useTranslations('household');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    inviteResidentAction.bind(null, member.personId),
  );
  const [eventId] = useState(() => crypto.randomUUID());
  const [invitationEventId] = useState(() => crypto.randomUUID());
  useCloseOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormError
        formError={state.status === 'error' ? state.formError : undefined}
      />
      <input type="hidden" name="client_event_id" value={eventId} />
      <input
        type="hidden"
        name="invitation_event_id"
        value={invitationEventId}
      />
      <Field
        label={t('fields.email')}
        info={{ label: t('members.addInfoLabel'), text: t('members.addInfo') }}
        error={message(errors.person_email)}
      >
        <Input
          name="person_email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={values.person_email ?? member.email ?? ''}
        />
      </Field>
      <FormActions
        pending={pending}
        submitLabel={t('members.send')}
        pendingLabel={t('members.sending')}
        onCancel={onCancel}
      />
    </form>
  );
}

/** The three delegations of one member (D23). Each toggle sends the complete set and rolls back if refused. */
function PermissionToggles({ member }: { member: MemberView }) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const { run, pending, notice } = useActionRunner();
  const [current, setCurrent] = useState<HouseholdPermission[]>(
    member.permissions,
  );
  const name = fullName(member);

  return (
    <fieldset
      aria-label={t('delegations.title', { name })}
      className="flex flex-col gap-1 border-t border-hairline pt-3"
    >
      <legend className="sr-only">{t('delegations.title', { name })}</legend>
      {householdPermissions.map((permission) => (
        <Switch
          key={permission}
          label={t(`delegations.permissions.${permission}`)}
          checked={current.includes(permission)}
          disabled={pending || !writable}
          onChange={(event) => {
            const before = current;
            const next = togglePermission(
              current,
              permission,
              event.target.checked,
            );
            setCurrent(next);
            run(
              () => setPermissionsAction(member.membershipId ?? '', next),
              (result) => {
                if (result.status === 'error') setCurrent(before);
              },
            );
          }}
        />
      ))}
      <ActionNotice notice={notice} className="mt-2" />
    </fieldset>
  );
}

type SheetKind = 'edit' | 'invite' | null;

function MemberRow({
  member,
  canManage,
  onNotice,
}: {
  member: MemberView;
  canManage: boolean;
  onNotice: (notice: Notice | null) => void;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { run, pending } = useActionRunner();
  const name = fullName(member);
  const manageable =
    canManage && member.standing !== 'holder' && !member.isSelf;
  const close = (notice: Notice | null) => {
    setSheet(null);
    onNotice(notice);
  };

  const standingBadge =
    member.standing === 'holder' ? (
      <Badge tone="info">{t('standing.holder')}</Badge>
    ) : member.standing === 'member' ? (
      <StatusBadge status="success">{t('standing.member')}</StatusBadge>
    ) : member.standing === 'invited' ? (
      <StatusBadge status="warning">{t('standing.invited')}</StatusBadge>
    ) : member.standing === 'minor' ? (
      <Badge>{t('standing.minor')}</Badge>
    ) : canManage ? (
      <Badge>{t('standing.unregistered')}</Badge>
    ) : null;

  return (
    <li className="flex flex-col gap-3 rounded-card-dense bg-surface-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-app-subheading">
            {name}
            {member.isSelf ? (
              <span className="ml-2 text-app-caption text-text-secondary">
                {t('you')}
              </span>
            ) : null}
          </span>
          <span className="truncate text-app-caption text-text-secondary">
            {t(`relationship.${member.relationship}`)}
            {member.detailed && member.email ? ` · ${member.email}` : ''}
          </span>
        </div>
        {standingBadge}
      </div>

      {member.invitation ? (
        <p className="text-app-caption text-text-secondary">
          {[
            member.invitation.email,
            t('members.expires', {
              date: formatDate(member.invitation.expiresAt),
            }),
          ].join(' · ')}
        </p>
      ) : null}

      {manageable ? (
        <div className="flex flex-wrap gap-2">
          {member.standing === 'unregistered' ? (
            <Button
              disabled={!writable}
              aria-label={t('members.inviteLabel', { name })}
              onClick={() => setSheet('invite')}
            >
              {t('members.invite')}
            </Button>
          ) : null}
          {member.standing === 'invited' && member.invitation ? (
            <>
              {member.invitation.delivered ? null : (
                <Button
                  disabled={!writable || pending}
                  aria-label={t('members.resendLabel', { name })}
                  onClick={() =>
                    run(
                      () =>
                        resendInvitationAction(
                          member.invitation?.invitationId ?? '',
                        ),
                      (result) => onNotice(noticeOf(result)),
                    )
                  }
                >
                  {t('members.resend')}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={!writable || pending}
                aria-label={t('members.revokeLabel', { name })}
                onClick={() =>
                  run(
                    () =>
                      revokeInvitationAction(
                        member.invitation?.invitationId ?? '',
                      ),
                    (result) => onNotice(noticeOf(result)),
                  )
                }
              >
                {t('members.revoke')}
              </Button>
            </>
          ) : null}
          <Button
            variant="secondary"
            disabled={!writable}
            aria-label={t('members.editLabel', { name })}
            onClick={() => setSheet('edit')}
          >
            {t('members.edit')}
          </Button>
          <Button
            variant="destructive"
            disabled={!writable}
            aria-label={t('members.endLabel', { name })}
            onClick={() => setConfirmEnd(true)}
          >
            {t('members.end')}
          </Button>
        </div>
      ) : null}

      {manageable && member.standing === 'member' && member.membershipId ? (
        <PermissionToggles key={member.permissions.join(',')} member={member} />
      ) : null}

      <Sheet
        open={sheet === 'edit'}
        title={t('members.editTitle')}
        closeLabel={t('close')}
        onClose={() => setSheet(null)}
      >
        <EditMemberForm
          member={member}
          onDone={close}
          onCancel={() => setSheet(null)}
        />
      </Sheet>
      <Sheet
        open={sheet === 'invite'}
        title={t('members.inviteTitle', { name })}
        closeLabel={t('close')}
        onClose={() => setSheet(null)}
      >
        <InviteMemberForm
          member={member}
          onDone={close}
          onCancel={() => setSheet(null)}
        />
      </Sheet>
      <ConfirmDialog
        open={confirmEnd}
        title={t('members.endTitle', { name })}
        confirmLabel={pending ? t('members.ending') : t('members.endConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={pending}
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() =>
          run(
            () => endMembershipAction(member.personId),
            (result) => {
              setConfirmEnd(false);
              onNotice(noticeOf(result));
            },
          )
        }
      >
        {t('members.endBody')}
      </ConfirmDialog>
    </li>
  );
}

/** Members of the household. The holder manages them; a member only sees who lives in the unit. */
export function MemberSection({
  members,
  canManage,
}: {
  members: readonly MemberView[];
  canManage: boolean;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 className="text-app-heading">{t('sections.members')}</h2>
          {canManage ? (
            <InfoButton label={t('delegations.infoLabel')}>
              {t('delegations.info')}
            </InfoButton>
          ) : null}
        </div>
        {canManage ? (
          <Button disabled={!writable} onClick={() => setAdding(true)}>
            {t('members.add')}
          </Button>
        ) : null}
      </div>
      <ActionNotice notice={notice} />
      {members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t('members.empty')}
          align="start"
        />
      ) : (
        <ul aria-label={t('members.listLabel')} className="flex flex-col gap-3">
          {members.map((member) => (
            <MemberRow
              key={member.residentId}
              member={member}
              canManage={canManage}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={adding}
        title={t('members.addTitle')}
        closeLabel={t('close')}
        onClose={() => setAdding(false)}
      >
        <AddMemberForm
          onDone={(done) => {
            setAdding(false);
            setNotice(done);
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </Card>
  );
}
