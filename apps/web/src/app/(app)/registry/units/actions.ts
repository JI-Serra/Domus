'use server';

import {
  initialHolderSchema,
  petFormSchema,
  residentFormSchema,
  residentInvitationSchema,
  unitFormSchema,
  vehicleFormSchema,
} from '@domus/domain/registry-ui';
import { reportError } from '@domus/observability';
import {
  archiveUnit,
  decideUnitJoinRequest,
  revokeResidentInvitation,
  rotateUnitJoinCode,
  saveResident,
  savePet,
  saveUnit,
  saveVehicle,
  sendResidentInvitation,
} from '@domus/supabase/registry';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSiteUrl } from '@/lib/auth/site-url';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { functionErrorCode } from '@/lib/platform/function-errors';
import { isUuid, writableScope, zodFieldErrors } from '@/lib/registry/action';
import { loadUnitSheet } from '@/lib/registry/data';
import type { UnitSheet } from '@/lib/registry/data';
import { registryErrorKey } from '@/lib/registry/errors';

const sheetPath = (unitId: string) => `/registry/units/${unitId}`;

const PERSON_FIELDS = [
  'person_first_name',
  'person_last_name',
  'person_document_type',
  'person_document_number',
  'person_email',
  'person_phone',
  'person_birth_date',
] as const;
const UNIT_FIELDS = [
  'unit_code',
  'unit_block_code',
  'unit_lot_number',
  'unit_status',
  'unit_coefficient',
  'unit_is_billable',
  'unit_contact_phone',
  'unit_backup_phone',
  'client_event_id',
] as const;
const HOLDER_PREFIX = 'holder_';

/** Creates a unit, or updates the one in `unitId`. An occupied unit is created together with its first holder. */
export async function saveUnitAction(
  unitId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const holderFields = PERSON_FIELDS.map((field) => `${HOLDER_PREFIX}${field}`);
  const values = textValues(formData, [...UNIT_FIELDS, ...holderFields]);
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(values.client_event_id) || (unitId !== null && !isUuid(unitId)))
    return formError('unknown', values);

  const parsed = unitFormSchema.safeParse(values);
  const errors = parsed.success ? {} : zodFieldErrors(parsed.error);

  // Creating an occupied unit: the first holder travels with it, so the "occupied needs a holder" rule holds at once.
  let holder: ReturnType<typeof initialHolderSchema.parse> | null = null;
  if (
    unitId === null &&
    parsed.success &&
    parsed.data.unit_status === 'occupied'
  ) {
    const holderValues: Record<string, string> = {};
    for (const field of PERSON_FIELDS)
      holderValues[field] = values[`${HOLDER_PREFIX}${field}`] ?? '';
    const holderParsed = initialHolderSchema.safeParse(holderValues);
    if (holderParsed.success) holder = holderParsed.data;
    else
      for (const [field, key] of Object.entries(
        zodFieldErrors(holderParsed.error),
      ))
        errors[`${HOLDER_PREFIX}${field}`] = key;
  }
  if (!parsed.success || Object.keys(errors).length > 0)
    return fieldError(errors, values);

  const { data, error } = await saveUnit(scope.client, {
    target_tenant_id: scope.tenantId,
    client_event_id: values.client_event_id,
    unit_data: {
      ...(unitId ? { unit_id: unitId } : {}),
      ...parsed.data,
    },
    residents: holder
      ? [
          {
            person: holder,
            resident: {
              unit_resident_relationship: 'owner',
              unit_resident_is_holder: true,
              unit_resident_is_minor: false,
            },
          },
        ]
      : [],
  });
  if (error || !data) {
    if (error) return formError(registryErrorKey(error, 'unit.save'), values);
    return formError('unknown', values);
  }
  revalidatePath('/registry/units');
  redirect(sheetPath(data));
}

/** Soft-archives the unit: its account invitations and memberships stop working, its history stays. */
export async function archiveUnitAction(
  unitId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  if (!isUuid(unitId)) return formError('denied');
  const { scope } = checked;
  const { error } = await archiveUnit(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: crypto.randomUUID(),
  });
  if (error) return formError(registryErrorKey(error, 'unit.archive'));
  revalidatePath('/registry/units');
  redirect('/registry/units');
}

type SheetResident = UnitSheet['residents'][number];

/** The payload that saves a resident exactly as the sheet shows it (full replacement: nothing may be omitted). */
function residentPayload(resident: SheetResident) {
  return {
    person: {
      person_id: resident.person_id,
      person_first_name: resident.person_first_name ?? '',
      person_last_name: resident.person_last_name ?? '',
      person_document_type: resident.person_document_type ?? null,
      person_document_number: resident.person_document_number ?? null,
      person_email: resident.person_email ?? null,
      person_phone: resident.person_phone ?? null,
      person_birth_date: resident.person_birth_date ?? null,
    },
    resident: {
      unit_resident_relationship: resident.unit_resident_relationship,
      unit_resident_is_holder: resident.unit_resident_is_holder,
      unit_resident_is_minor: resident.unit_resident_is_minor,
      unit_resident_valid_from_at: resident.unit_resident_valid_from_at,
      unit_resident_valid_to_at: resident.unit_resident_valid_to_at,
    },
  };
}

const RESIDENT_FIELDS = [
  ...PERSON_FIELDS,
  'unit_resident_relationship',
  'unit_resident_is_holder',
  'unit_resident_is_minor',
  'client_event_id',
] as const;

/** Adds a resident to the unit, or edits `personId`'s data and relationship. */
export async function saveResidentAction(
  unitId: string,
  personId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, RESIDENT_FIELDS);
  // Checkboxes are absent from the form data when off; keep their state for a re-render after an error.
  for (const flag of ['unit_resident_is_holder', 'unit_resident_is_minor'])
    if (formData.get(flag)) values[flag] = 'on';
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (
    !isUuid(unitId) ||
    (personId !== null && !isUuid(personId)) ||
    !isUuid(values.client_event_id)
  )
    return formError('unknown', values);

  const parsed = residentFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);

  // Editing keeps the residence period as it is; the RPC replaces what it is not given.
  let residence: Pick<
    ReturnType<typeof residentPayload>['resident'],
    'unit_resident_valid_from_at' | 'unit_resident_valid_to_at'
  > | null = null;
  if (personId) {
    const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
    const current = sheet?.residents.find((row) => row.person_id === personId);
    if (!current) return formError('denied', values);
    residence = {
      unit_resident_valid_from_at: current.unit_resident_valid_from_at,
      unit_resident_valid_to_at: current.unit_resident_valid_to_at,
    };
  }

  const person = {
    person_id: personId ?? undefined,
    person_first_name: parsed.data.person_first_name,
    person_last_name: parsed.data.person_last_name,
    person_document_type: parsed.data.person_document_type,
    person_document_number: parsed.data.person_document_number,
    person_email: parsed.data.person_email,
    person_phone: parsed.data.person_phone,
    person_birth_date: parsed.data.person_birth_date,
  };
  const { error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: values.client_event_id,
    person_data: person,
    resident_data: {
      unit_resident_relationship: parsed.data.unit_resident_relationship,
      unit_resident_is_holder: parsed.data.unit_resident_is_holder,
      unit_resident_is_minor: parsed.data.unit_resident_is_minor,
      ...(residence ?? {}),
    },
  });
  if (error) return formError(registryErrorKey(error, 'resident.save'), values);
  revalidatePath(sheetPath(unitId));
  return {
    status: 'success',
    notice: personId ? 'residentSaved' : 'residentAdded',
  };
}

/** Ends a person's residence today. The unit keeps its history; an occupied unit still needs an adult holder. */
export async function endResidenceAction(
  unitId: string,
  personId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(unitId) || !isUuid(personId)) return formError('denied');
  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  const current = sheet?.residents.find((row) => row.person_id === personId);
  if (!current) return formError('denied');
  const payload = residentPayload(current);
  const { error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: crypto.randomUUID(),
    person_data: payload.person,
    resident_data: {
      ...payload.resident,
      unit_resident_valid_to_at: new Date().toISOString(),
    },
  });
  if (error) return formError(registryErrorKey(error, 'resident.end'));
  revalidatePath(sheetPath(unitId));
  return { status: 'success', notice: 'residenceEnded' };
}

const INVITE_FIELDS = [
  'invited_email',
  'target_role',
  'mode',
  'client_event_id',
] as const;

/**
 * Invites a resident to open an account: by email (the `send-invitation` Edge Function delivers it) or as a one-time
 * link that this answer carries once and nothing stores. Minors never receive one; the database refuses them too.
 */
export async function inviteResidentAction(
  unitId: string,
  personId: string,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, INVITE_FIELDS);
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(unitId) || !isUuid(personId) || !isUuid(values.client_event_id))
    return formError('unknown', values);
  const parsed = residentInvitationSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);

  const input = {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    invited_email: parsed.data.invited_email,
    target_role: parsed.data.target_role,
    client_event_id: values.client_event_id,
    target_person_id: personId,
  };

  if (parsed.data.mode === 'email') {
    const { error } = await sendResidentInvitation(scope.client, input);
    if (error) {
      const code = await functionErrorCode(error);
      if (code === 'delivery_failed')
        return formError('deliveryFailed', values);
      if (code === 'forbidden' || code === 'unauthorized')
        return formError('denied', values);
      if (code === 'invalid_input') return formError('inviteInvalid', values);
      reportError(new Error(`Resident invitation failed (${code})`), {
        operation: 'resident.invite',
      });
      return formError('unknown', values);
    }
    revalidatePath(sheetPath(unitId));
    return { status: 'success', notice: 'invitationSent' };
  }

  // One-time link: the secret is issued by the database, handed to this administrator once, and marked as delivered
  // so a retry cannot issue a second one. The invitee still proves the mailbox before the account is bound.
  const { data, error } = await scope.client.rpc(
    'create_resident_invitation',
    input,
  );
  if (error)
    return formError(registryErrorKey(error, 'resident.invite'), values);
  const row = data?.[0];
  if (!row?.invitation_token) return formError('linkUnavailable', values);
  await scope.client.rpc('mark_resident_invitation_delivered', {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    target_invitation_id: row.invitation_id,
  });
  revalidatePath(sheetPath(unitId));
  const link = new URL('/invitations/accept', await getSiteUrl());
  link.searchParams.set('token', row.invitation_token);
  return { status: 'success', notice: 'invitationLink', value: link.href };
}

export async function revokeInvitationAction(
  unitId: string,
  invitationId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  if (!isUuid(unitId) || !isUuid(invitationId)) return formError('denied');
  const { scope } = checked;
  const { error } = await revokeResidentInvitation(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    target_invitation_id: invitationId,
  });
  if (error) return formError(registryErrorKey(error, 'invitation.revoke'));
  revalidatePath(sheetPath(unitId));
  return { status: 'success', notice: 'invitationRevoked' };
}

/**
 * D22: approving a join request creates the resident and a pending invitation; it never opens an account by itself.
 * The invitation is then delivered by the Edge Function, which retries the invitation the decision created.
 */
export async function decideJoinRequestAction(
  unitId: string,
  requestId: string,
  approve: boolean,
  role: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(unitId) || !isUuid(requestId)) return formError('denied');
  const targetRole =
    role === 'unit_holder' ? 'unit_holder' : 'household_member';

  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  const request = sheet?.pending_join_requests.find(
    (row) => row.unit_join_request_id === requestId,
  );
  if (!request) return formError('denied');

  const { data, error } = await decideUnitJoinRequest(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    target_request_id: requestId,
    approve,
    client_event_id: crypto.randomUUID(),
    target_role: targetRole,
  });
  if (error) return formError(registryErrorKey(error, 'joinRequest.decide'));
  if (!approve) {
    revalidatePath(sheetPath(unitId));
    return { status: 'success', notice: 'requestRejected' };
  }

  const decision = data as {
    status?: string;
    invitation_client_event_id?: string;
    person_id?: string;
  } | null;
  if (
    decision?.status !== 'approved' ||
    !isUuid(decision.invitation_client_event_id) ||
    !isUuid(decision.person_id)
  ) {
    revalidatePath(sheetPath(unitId));
    return formError('unknown');
  }
  const delivery = await sendResidentInvitation(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    invited_email: request.unit_join_request_email,
    target_role: targetRole,
    client_event_id: decision.invitation_client_event_id,
    target_person_id: decision.person_id,
  });
  revalidatePath(sheetPath(unitId));
  if (delivery.error) {
    // The decision stands; the invitation stays pending and can be sent again from the unit's invitations.
    const code = await functionErrorCode(delivery.error);
    reportError(new Error(`Approved request delivery failed (${code})`), {
      operation: 'joinRequest.deliver',
    });
    return { status: 'success', notice: 'requestApprovedNotSent' };
  }
  return { status: 'success', notice: 'requestApproved' };
}

/** Generates a new unit join code and answers with it once; the previous code stops working. */
export async function rotateJoinCodeAction(
  unitId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  if (!isUuid(unitId)) return formError('denied');
  const { scope } = checked;
  const { data, error } = await rotateUnitJoinCode(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
  });
  if (error || !data) {
    if (error) return formError(registryErrorKey(error, 'joinCode.rotate'));
    return formError('unknown');
  }
  return { status: 'success', notice: 'codeRotated', value: data };
}

const VEHICLE_FIELDS = [
  'vehicle_plate_code',
  'vehicle_make_name',
  'vehicle_model_name',
  'vehicle_color_name',
  'client_event_id',
] as const;

export async function saveVehicleAction(
  unitId: string,
  vehicleId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, VEHICLE_FIELDS);
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (
    !isUuid(unitId) ||
    (vehicleId !== null && !isUuid(vehicleId)) ||
    !isUuid(values.client_event_id)
  )
    return formError('unknown', values);
  const parsed = vehicleFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);
  const { error } = await saveVehicle(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: values.client_event_id,
    vehicle_data: {
      ...(vehicleId ? { vehicle_id: vehicleId } : {}),
      ...parsed.data,
    },
  });
  if (error) return formError(registryErrorKey(error, 'vehicle.save'), values);
  revalidatePath(sheetPath(unitId));
  return {
    status: 'success',
    notice: vehicleId ? 'vehicleSaved' : 'vehicleAdded',
  };
}

export async function archiveVehicleAction(
  unitId: string,
  vehicleId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(unitId) || !isUuid(vehicleId)) return formError('denied');
  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  const vehicle = sheet?.vehicles.find((row) => row.vehicle_id === vehicleId);
  if (!vehicle) return formError('denied');
  const { error } = await saveVehicle(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: crypto.randomUUID(),
    vehicle_data: {
      vehicle_id: vehicleId,
      vehicle_plate_code: vehicle.vehicle_plate_code,
      vehicle_make_name: vehicle.vehicle_make_name,
      vehicle_model_name: vehicle.vehicle_model_name,
      vehicle_color_name: vehicle.vehicle_color_name,
      vehicle_archived_at: new Date().toISOString(),
    },
  });
  if (error) return formError(registryErrorKey(error, 'vehicle.archive'));
  revalidatePath(sheetPath(unitId));
  return { status: 'success', notice: 'vehicleArchived' };
}

const PET_FIELDS = [
  'pet_name',
  'pet_species_name',
  'pet_breed_name',
  'client_event_id',
] as const;

export async function savePetAction(
  unitId: string,
  petId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, PET_FIELDS);
  const checked = await writableScope('registry', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (
    !isUuid(unitId) ||
    (petId !== null && !isUuid(petId)) ||
    !isUuid(values.client_event_id)
  )
    return formError('unknown', values);
  const parsed = petFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);

  // Editing keeps the stored photo: the RPC replaces what it is not given.
  let photoPath: string | null = null;
  if (petId) {
    const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
    photoPath =
      sheet?.pets.find((row) => row.pet_id === petId)?.pet_photo_path ?? null;
  }
  const { error } = await savePet(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: values.client_event_id,
    pet_data: {
      ...(petId ? { pet_id: petId } : {}),
      ...parsed.data,
      pet_photo_path: photoPath,
    },
  });
  if (error) return formError(registryErrorKey(error, 'pet.save'), values);
  revalidatePath(sheetPath(unitId));
  return { status: 'success', notice: petId ? 'petSaved' : 'petAdded' };
}

export async function archivePetAction(
  unitId: string,
  petId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(unitId) || !isUuid(petId)) return formError('denied');
  const sheet = await loadUnitSheet(scope.client, scope.tenantId, unitId);
  const pet = sheet?.pets.find((row) => row.pet_id === petId);
  if (!pet) return formError('denied');
  const { error } = await savePet(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: unitId,
    client_event_id: crypto.randomUUID(),
    pet_data: {
      pet_id: petId,
      pet_name: pet.pet_name,
      pet_species_name: pet.pet_species_name,
      pet_breed_name: pet.pet_breed_name,
      pet_photo_path: pet.pet_photo_path,
      pet_archived_at: new Date().toISOString(),
    },
  });
  if (error) return formError(registryErrorKey(error, 'pet.archive'));
  revalidatePath(sheetPath(unitId));
  return { status: 'success', notice: 'petArchived' };
}
