'use server';

import { guardInvitationSchema } from '@domus/domain/registry-ui';
import { reportError } from '@domus/observability';
import { revokeInvitation, sendInvitation } from '@domus/supabase/platform';
import { assignGuardGate } from '@domus/supabase/registry';
import { revalidatePath } from 'next/cache';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { functionErrorCode } from '@/lib/platform/function-errors';
import { isUuid, writableScope, zodFieldErrors } from '@/lib/registry/action';
import { registryErrorKey } from '@/lib/registry/errors';

const GUARDS_PATH = '/registry/guards';
const INVITE_FIELDS = [
  'invited_email',
  'first_name',
  'last_name',
  'client_event_id',
] as const;

/** Invites a guard by email: the invitation creates a `guard` membership of this barrio once it is accepted. */
export async function inviteGuardAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, INVITE_FIELDS);
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(values.client_event_id)) return formError('unknown', values);
  const parsed = guardInvitationSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);

  const { error } = await sendInvitation(scope.client, {
    target_tenant_id: scope.tenantId,
    invited_email: parsed.data.invited_email,
    target_role: 'guard',
    first_name: parsed.data.first_name,
    last_name: parsed.data.last_name,
    client_event_id: values.client_event_id,
  });
  if (error) {
    const code = await functionErrorCode(error);
    if (code === 'delivery_failed') return formError('deliveryFailed', values);
    if (code === 'forbidden' || code === 'unauthorized')
      return formError('denied', values);
    if (code === 'invalid_input') return formError('inviteInvalid', values);
    reportError(new Error(`Guard invitation failed (${code})`), {
      operation: 'guard.invite',
    });
    return formError('unknown', values);
  }
  revalidatePath(GUARDS_PATH);
  return { status: 'success', notice: 'guardInvited' };
}

export async function revokeGuardInvitationAction(
  invitationId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(invitationId)) return formError('denied');
  const { error } = await revokeInvitation(scope.client, invitationId);
  if (error)
    return formError(registryErrorKey(error, 'guard.invitation.revoke'));
  revalidatePath(GUARDS_PATH);
  return { status: 'success', notice: 'invitationRevoked' };
}

/** Assigns a guard to a gate, or takes them off it. Needs the `guards` permission. */
export async function assignGuardGateAction(
  membershipId: string,
  gateId: string,
  assigned: boolean,
): Promise<PlatformFormState> {
  const checked = await writableScope('guards');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(membershipId) || !isUuid(gateId)) return formError('denied');
  const { error } = await assignGuardGate(scope.client, {
    target_tenant_id: scope.tenantId,
    target_gate_id: gateId,
    target_membership_id: membershipId,
    assigned,
    client_event_id: crypto.randomUUID(),
  });
  if (error) return formError(registryErrorKey(error, 'guard.assign'));
  revalidatePath(GUARDS_PATH);
  return { status: 'success', notice: 'assignmentSaved' };
}

/** Deactivates a guard: their membership is revoked and the console stops opening for them. */
export async function deactivateGuardAction(
  membershipId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(membershipId)) return formError('denied');
  const { error } = await scope.client.rpc('revoke_membership', {
    target_membership_id: membershipId,
  });
  if (error) return formError(registryErrorKey(error, 'guard.deactivate'));
  revalidatePath(GUARDS_PATH);
  return { status: 'success', notice: 'guardDeactivated' };
}
