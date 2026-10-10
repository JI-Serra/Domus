'use server';

import {
  isPetPhotoPathOf,
  memberDetailsSchema,
  memberFormSchema,
  memberInvitationSchema,
  petFormSchema,
  vehicleFormSchema,
} from '@domus/domain/household';
import type { HouseholdPermission } from '@domus/domain/household';
import { fieldErrors } from '@domus/domain/platform';
import { householdPermissions } from '@domus/domain/registry';
import {
  decideUnitJoinRequest,
  revokeResidentInvitation,
  rotateUnitJoinCode,
  savePet,
  saveResident,
  saveVehicle,
  sendResidentInvitation,
  setHouseholdPermissions,
} from '@domus/supabase/registry';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { reportError } from '@domus/observability';
import { revalidatePath } from 'next/cache';
import { getManagerScope, loadHouseholdSheet } from '@/lib/household/scope';
import type { HouseholdScope } from '@/lib/household/scope';
import { buildHouseholdView } from '@/lib/household/view';
import type { HouseholdSheet, MemberView } from '@/lib/household/view';
import { functionErrorCode } from '@/lib/platform/function-errors';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOME_PATH = '/home';

type Json = Parameters<typeof saveResident>[1]['person_data'];

/** Drops empty optional fields: the database treats an omitted field as "not given". */
function compact(record: Record<string, unknown>): Json {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    ),
  ) as Json;
}

/** Database errors become message keys of the forms; only unexpected ones are reported (no PII, only the code). */
function failure(
  error: { code?: string },
  operation: string,
  values?: Record<string, string>,
): PlatformFormState {
  switch (error.code) {
    case '42501':
      return formError('denied', values);
    case '22023':
      return formError('invalid', values);
    case '23514':
      return formError('holderRequired', values);
    case '23505':
      return formError('duplicate', values);
    default:
      reportError(
        new Error(`${operation} failed (${error.code ?? 'unknown'})`),
        {
          operation,
        },
      );
      return formError('unknown', values);
  }
}

async function deliveryFailure(
  error: unknown,
  values?: Record<string, string>,
): Promise<PlatformFormState> {
  const code = await functionErrorCode(error);
  if (code === 'delivery_failed') return formError('deliveryFailed', values);
  if (code === 'forbidden' || code === 'unauthorized')
    return formError('denied', values);
  if (code === 'invalid_input') return formError('invalid', values);
  reportError(new Error(`Resident invitation failed (${code})`), {
    operation: 'household.invite',
  });
  return formError('unknown', values);
}

/**
 * What the database lets a holder change (T19, `save_resident`): only people they registered who have no account and
 * were never invited. Account members and invited people can't be edited or ended by the holder (a registry admin
 * does that); the holder can revoke an invitation, after which the person is editable again.
 */
function isEditableStanding(standing: MemberView['standing']): boolean {
  return standing === 'unregistered' || standing === 'minor';
}

type SheetResident = HouseholdSheet['residents'][number];

/** The person and residence of a sheet row as the full-replacement payloads of `save_resident`. */
function residentPayload(
  resident: SheetResident,
  changes: {
    person?: Record<string, unknown>;
    resident?: Record<string, unknown>;
  } = {},
) {
  return {
    person_data: compact({
      person_id: resident.person_id,
      person_first_name: resident.person_first_name,
      person_last_name: resident.person_last_name,
      person_document_type: resident.person_document_type,
      person_document_number: resident.person_document_number,
      person_email: resident.person_email,
      person_phone: resident.person_phone,
      person_birth_date: resident.person_birth_date,
      ...changes.person,
    }),
    resident_data: compact({
      unit_resident_relationship: resident.unit_resident_relationship,
      unit_resident_is_holder: false,
      unit_resident_is_minor: resident.unit_resident_is_minor,
      unit_resident_valid_from_at: resident.unit_resident_valid_from_at,
      unit_resident_valid_to_at: resident.unit_resident_valid_to_at,
      ...changes.resident,
    }),
  };
}

interface Loaded {
  scope: HouseholdScope;
  sheet: HouseholdSheet;
  members: MemberView[];
}

/** The scope of a holder plus a fresh sheet; null when the caller is not allowed (or the sheet is refused). */
async function loadManaged(): Promise<
  Loaded | { problem: 'denied' | 'readOnly' }
> {
  const { scope, problem } = await getManagerScope();
  if (!scope) return { problem };
  const sheet = await loadHouseholdSheet(scope);
  if (!sheet) return { problem: 'denied' };
  const view = buildHouseholdView(
    sheet,
    { membershipId: scope.membershipId, isHolder: true },
    new Date(),
  );
  return { scope, sheet, members: view.members };
}

const MEMBER_FIELDS = [
  'person_first_name',
  'person_last_name',
  'person_email',
  'person_phone',
  'person_birth_date',
  'unit_resident_relationship',
  'client_event_id',
  'invitation_event_id',
] as const;

function sendInvitation(
  client: DomusSupabaseClient,
  scope: HouseholdScope,
  invitation: { email: string; personId: string; eventId: string },
) {
  return sendResidentInvitation(client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    invited_email: invitation.email,
    target_role: 'household_member',
    client_event_id: invitation.eventId,
    target_person_id: invitation.personId,
  });
}

/**
 * "Agregar miembro": registers the person in the household and, for an adult, sends the invitation. Both steps carry
 * their own idempotency key, so retrying after a failed delivery neither duplicates the resident nor the email.
 */
export async function addMemberAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, MEMBER_FIELDS);
  const isMinor = formData.get('is_minor') === 'on';
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem, values);
  const { scope } = loaded;

  const parsed = memberFormSchema.safeParse({ ...values, is_minor: isMinor });
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (
    !UUID.test(values.client_event_id ?? '') ||
    !UUID.test(values.invitation_event_id ?? '')
  )
    return formError('unknown', values);

  const { data: residentId, error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    person_data: compact({
      person_first_name: parsed.data.person_first_name,
      person_last_name: parsed.data.person_last_name,
      person_email: parsed.data.person_email,
      person_phone: parsed.data.person_phone,
      person_birth_date: parsed.data.person_birth_date,
    }),
    resident_data: compact({
      unit_resident_relationship: parsed.data.unit_resident_relationship,
      unit_resident_is_holder: false,
      unit_resident_is_minor: parsed.data.is_minor,
    }),
    client_event_id: values.client_event_id ?? '',
  });
  if (error || !residentId)
    return failure(error ?? {}, 'household.member.add', values);
  revalidatePath(HOME_PATH);
  if (parsed.data.is_minor) return { status: 'success', notice: 'minorAdded' };

  const sheet = await loadHouseholdSheet(scope);
  const personId = sheet?.residents.find(
    (resident) => resident.unit_resident_id === residentId,
  )?.person_id;
  if (!personId || !parsed.data.person_email)
    return formError('unknown', values);
  const sent = await sendInvitation(scope.client, scope, {
    email: parsed.data.person_email,
    personId,
    eventId: values.invitation_event_id ?? '',
  });
  if (sent.error) return deliveryFailure(sent.error, values);
  return { status: 'success', notice: 'invited' };
}

const INVITE_FIELDS = [
  'person_email',
  'client_event_id',
  'invitation_event_id',
] as const;

/** Invites a resident who has no account yet (the email is saved on the person first when it changed). */
export async function inviteResidentAction(
  personId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, INVITE_FIELDS);
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem, values);
  const { scope, sheet, members } = loaded;

  const parsed = memberInvitationSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  const member = members.find((candidate) => candidate.personId === personId);
  const resident = sheet.residents.find(
    (candidate) => candidate.person_id === personId,
  );
  if (
    !UUID.test(personId) ||
    !UUID.test(values.client_event_id ?? '') ||
    !UUID.test(values.invitation_event_id ?? '') ||
    !member ||
    !resident ||
    member.standing !== 'unregistered'
  )
    return formError('denied', values);

  if (resident.person_email !== parsed.data.person_email) {
    const payload = residentPayload(resident, {
      person: { person_email: parsed.data.person_email },
    });
    const saved = await saveResident(scope.client, {
      target_tenant_id: scope.tenantId,
      target_unit_id: scope.unitId,
      ...payload,
      client_event_id: values.client_event_id ?? '',
    });
    if (saved.error)
      return failure(saved.error, 'household.member.email', values);
  }
  const sent = await sendInvitation(scope.client, scope, {
    email: parsed.data.person_email,
    personId,
    eventId: values.invitation_event_id ?? '',
  });
  if (sent.error) return deliveryFailure(sent.error, values);
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'invited' };
}

/** Sends a pending invitation again (same key: an undelivered one gets a fresh link, a delivered one is a no-op). */
export async function resendInvitationAction(
  invitationId: string,
): Promise<PlatformFormState> {
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem);
  const { scope, sheet } = loaded;
  const invitation = sheet.pending_invitations.find(
    (candidate) =>
      candidate.invitation_id === invitationId &&
      candidate.person_id !== null &&
      candidate.invitation_delivered_at === null,
  );
  if (!UUID.test(invitationId) || !invitation?.person_id)
    return formError('denied');
  const sent = await sendInvitation(scope.client, scope, {
    email: invitation.invitation_email,
    personId: invitation.person_id,
    eventId: invitation.client_event_id,
  });
  if (sent.error) return deliveryFailure(sent.error);
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'resent' };
}

export async function revokeInvitationAction(
  invitationId: string,
): Promise<PlatformFormState> {
  const { scope, problem } = await getManagerScope();
  if (!scope || !UUID.test(invitationId)) return formError(problem ?? 'denied');
  const { error } = await revokeResidentInvitation(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    target_invitation_id: invitationId,
  });
  if (error) return failure(error, 'household.invitation.revoke');
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'revoked' };
}

const DETAIL_FIELDS = [
  'person_first_name',
  'person_last_name',
  'person_email',
  'person_phone',
  'person_birth_date',
  'unit_resident_relationship',
] as const;

/** Edits a member's name, relationship, phone and birth date (the email only while there is no account tied to it). */
export async function updateMemberAction(
  personId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, DETAIL_FIELDS);
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem, values);
  const { scope, sheet, members } = loaded;

  const member = members.find((candidate) => candidate.personId === personId);
  const resident = sheet.residents.find(
    (candidate) => candidate.person_id === personId,
  );
  if (
    !UUID.test(personId) ||
    !member ||
    !resident ||
    !isEditableStanding(member.standing)
  )
    return formError('denied', values);
  const parsed = memberDetailsSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);

  const { person_data, resident_data } = residentPayload(resident, {
    person: {
      person_first_name: parsed.data.person_first_name,
      person_last_name: parsed.data.person_last_name,
      person_phone: parsed.data.person_phone,
      person_birth_date: parsed.data.person_birth_date,
      person_email: parsed.data.person_email,
    },
    resident: {
      unit_resident_relationship: parsed.data.unit_resident_relationship,
    },
  });
  const { error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    person_data,
    resident_data,
    client_event_id: crypto.randomUUID(),
  });
  if (error) return failure(error, 'household.member.update', values);
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'saved' };
}

/** Ends the residence of a person without account (see `isEditableStanding`). */
export async function endMembershipAction(
  personId: string,
): Promise<PlatformFormState> {
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem);
  const { scope, sheet, members } = loaded;
  const member = members.find((candidate) => candidate.personId === personId);
  const resident = sheet.residents.find(
    (candidate) => candidate.person_id === personId,
  );
  if (
    !UUID.test(personId) ||
    !member ||
    !resident ||
    !isEditableStanding(member.standing) ||
    member.isSelf
  )
    return formError('denied');

  const { person_data, resident_data } = residentPayload(resident, {
    resident: { unit_resident_valid_to_at: new Date().toISOString() },
  });
  const { error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    person_data,
    resident_data,
    client_event_id: crypto.randomUUID(),
  });
  if (error) return failure(error, 'household.member.end');
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'ended' };
}

/**
 * Replaces a member's delegated permissions (D23). The database refuses minors, self-grants and anybody who is not a
 * holder of the unit; this only validates the shape.
 */
export async function setPermissionsAction(
  membershipId: string,
  permissions: readonly string[],
): Promise<PlatformFormState> {
  const { scope, problem } = await getManagerScope();
  const valid = permissions.every(
    (permission): permission is HouseholdPermission =>
      (householdPermissions as readonly string[]).includes(permission),
  );
  if (!scope || !UUID.test(membershipId) || !valid)
    return formError(problem ?? 'denied');
  const { error } = await setHouseholdPermissions(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    target_membership_id: membershipId,
    permissions: [...new Set(permissions)] as HouseholdPermission[],
    client_event_id: crypto.randomUUID(),
  });
  if (error) return failure(error, 'household.permissions');
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'permissionsSaved' };
}

const VEHICLE_FIELDS = [
  'vehicle_plate_code',
  'vehicle_make_name',
  'vehicle_model_name',
  'vehicle_color_name',
  'client_event_id',
] as const;

export async function saveVehicleAction(
  vehicleId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, VEHICLE_FIELDS);
  const { scope, problem } = await getManagerScope();
  if (!scope) return formError(problem, values);
  const parsed = vehicleFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (
    (vehicleId !== null && !UUID.test(vehicleId)) ||
    !UUID.test(values.client_event_id ?? '')
  )
    return formError('unknown', values);
  const { error } = await saveVehicle(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    vehicle_data: compact({ vehicle_id: vehicleId, ...parsed.data }),
    client_event_id: values.client_event_id ?? '',
  });
  if (error) {
    if (error.code === '23505')
      return fieldError({ vehicle_plate_code: 'plateTaken' }, values);
    return failure(error, 'household.vehicle.save', values);
  }
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'saved' };
}

export async function removeVehicleAction(
  vehicleId: string,
): Promise<PlatformFormState> {
  const { scope, problem } = await getManagerScope();
  if (!scope || !UUID.test(vehicleId)) return formError(problem ?? 'denied');
  const sheet = await loadHouseholdSheet(scope);
  const vehicle = sheet?.vehicles.find(
    (candidate) => candidate.vehicle_id === vehicleId,
  );
  if (!vehicle) return formError('denied');
  const { error } = await saveVehicle(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    vehicle_data: compact({
      vehicle_id: vehicle.vehicle_id,
      vehicle_plate_code: vehicle.vehicle_plate_code,
      vehicle_make_name: vehicle.vehicle_make_name,
      vehicle_model_name: vehicle.vehicle_model_name,
      vehicle_color_name: vehicle.vehicle_color_name,
      vehicle_archived_at: new Date().toISOString(),
    }),
    client_event_id: crypto.randomUUID(),
  });
  if (error) return failure(error, 'household.vehicle.remove');
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'removed' };
}

const PET_FIELDS = [
  'pet_name',
  'pet_species_name',
  'pet_breed_name',
  'pet_photo_path',
  'remove_photo',
  'client_event_id',
] as const;

/**
 * Saves a pet. The photo was already uploaded by the browser to the private bucket under this unit's folder; only
 * its path arrives here and it is checked to belong to this unit before it is stored.
 */
export async function savePetAction(
  petId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, PET_FIELDS);
  const { scope, problem } = await getManagerScope();
  if (!scope) return formError(problem, values);
  const parsed = petFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (
    (petId !== null && !UUID.test(petId)) ||
    !UUID.test(values.client_event_id ?? '')
  )
    return formError('unknown', values);

  let photoPath: string | null = null;
  if (values.pet_photo_path) {
    if (!isPetPhotoPathOf(values.pet_photo_path, scope.tenantId, scope.unitId))
      return fieldError({ photo: 'photoUploadFailed' }, values);
    photoPath = values.pet_photo_path;
  } else if (petId !== null && values.remove_photo !== '1') {
    const sheet = await loadHouseholdSheet(scope);
    photoPath =
      sheet?.pets.find((candidate) => candidate.pet_id === petId)
        ?.pet_photo_path ?? null;
  }
  const { error } = await savePet(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    pet_data: compact({
      pet_id: petId,
      ...parsed.data,
      pet_photo_path: photoPath,
    }),
    client_event_id: values.client_event_id ?? '',
  });
  if (error) return failure(error, 'household.pet.save', values);
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'saved' };
}

export async function removePetAction(
  petId: string,
): Promise<PlatformFormState> {
  const { scope, problem } = await getManagerScope();
  if (!scope || !UUID.test(petId)) return formError(problem ?? 'denied');
  const sheet = await loadHouseholdSheet(scope);
  const pet = sheet?.pets.find((candidate) => candidate.pet_id === petId);
  if (!pet) return formError('denied');
  const { error } = await savePet(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    pet_data: compact({
      pet_id: pet.pet_id,
      pet_name: pet.pet_name,
      pet_species_name: pet.pet_species_name,
      pet_breed_name: pet.pet_breed_name,
      pet_photo_path: pet.pet_photo_path,
      pet_archived_at: new Date().toISOString(),
    }),
    client_event_id: crypto.randomUUID(),
  });
  if (error) return failure(error, 'household.pet.remove');
  revalidatePath(HOME_PATH);
  return { status: 'success', notice: 'removed' };
}

/**
 * Approves or rejects a join request (D22). Approval creates the resident and a pending invitation without secret;
 * the email with the link goes out through the same Edge Function as every resident invitation, retrying the
 * invitation the decision issued. No access exists until the requester accepts that email.
 */
export async function decideJoinRequestAction(
  requestId: string,
  approve: boolean,
  eventId: string,
): Promise<PlatformFormState> {
  const loaded = await loadManaged();
  if ('problem' in loaded) return formError(loaded.problem);
  const { scope, sheet } = loaded;
  const request = sheet.pending_join_requests.find(
    (candidate) => candidate.unit_join_request_id === requestId,
  );
  if (!UUID.test(requestId) || !UUID.test(eventId) || !request)
    return formError('denied');

  const { data, error } = await decideUnitJoinRequest(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
    target_request_id: requestId,
    approve,
    client_event_id: eventId,
    target_role: 'household_member',
  });
  if (error) return failure(error, 'household.join.decide');
  revalidatePath(HOME_PATH);
  if (!approve) return { status: 'success', notice: 'rejected' };

  const decision = data as {
    status?: string;
    invitation_client_event_id?: string;
    person_id?: string;
  } | null;
  if (
    decision?.status !== 'approved' ||
    !decision.invitation_client_event_id ||
    !decision.person_id
  )
    return formError('unknown');
  const sent = await sendInvitation(scope.client, scope, {
    email: request.unit_join_request_email,
    personId: decision.person_id,
    eventId: decision.invitation_client_event_id,
  });
  if (sent.error) return deliveryFailure(sent.error);
  return { status: 'success', notice: 'approved' };
}

/** Generates a new unit code. The previous one stops working and the new one is shown once, never stored in clear. */
export async function rotateJoinCodeAction(): Promise<PlatformFormState> {
  const { scope, problem } = await getManagerScope();
  if (!scope) return formError(problem);
  const { data: code, error } = await rotateUnitJoinCode(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: scope.unitId,
  });
  if (error || !code) return failure(error ?? {}, 'household.joinCode.rotate');
  return { status: 'success', notice: 'rotated', value: code };
}
