'use server';

import { saveResident, saveVehicle } from '@domus/supabase/registry';
import { revalidatePath } from 'next/cache';
import { formError } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { isUuid, writableScope } from '@/lib/registry/action';
import { registryErrorKey } from '@/lib/registry/errors';
import { loadPendingVerification } from '@/lib/registry/verification';

const PATH = '/registry/verification';

/**
 * Settles the claim of one person. `declared` makes what the household declared the register's data; `registered`
 * keeps what the register already holds (and drops the claim). Both go through `save_resident` with the explicit
 * `person_id` (no implicit merge): the database refuses `declared` while another person still holds that document or
 * email, which is the message the administrator needs to act on.
 */
export async function resolvePersonClaimAction(
  personId: string,
  choice: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(personId) || (choice !== 'declared' && choice !== 'registered'))
    return formError('denied');

  const pending = await loadPendingVerification(scope.client, scope.tenantId);
  const person = pending.people.find((row) => row.person_id === personId);
  if (!person) return formError('denied');
  if (!person.unit) return formError('noResidence');

  const [personRow, residentRow] = await Promise.all([
    scope.client
      .from('person')
      .select('person_phone, person_birth_date')
      .eq('tenant_id', scope.tenantId)
      .eq('person_id', personId)
      .maybeSingle(),
    scope.client
      .from('unit_resident')
      .select(
        'unit_resident_relationship, unit_resident_is_holder, unit_resident_is_minor, unit_resident_valid_from_at, unit_resident_valid_to_at',
      )
      .eq('tenant_id', scope.tenantId)
      .eq('unit_id', person.unit.unit_id)
      .eq('person_id', personId)
      .maybeSingle(),
  ]);
  if (!personRow.data || !residentRow.data) return formError('denied');

  const useDeclared = choice === 'declared';
  const document =
    useDeclared && person.declared.documentNumber
      ? {
          type: person.declared.documentType,
          number: person.declared.documentNumber,
        }
      : {
          type: person.registered.documentType,
          number: person.registered.documentNumber,
        };
  const email = useDeclared
    ? (person.declared.email ?? person.registered.email)
    : person.registered.email;

  const { error } = await saveResident(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: person.unit.unit_id,
    client_event_id: crypto.randomUUID(),
    person_data: {
      person_id: personId,
      person_first_name: person.person_first_name,
      person_last_name: person.person_last_name,
      person_document_type: document.type,
      person_document_number: document.number,
      person_email: email,
      person_phone: personRow.data.person_phone,
      person_birth_date: personRow.data.person_birth_date,
    },
    resident_data: { ...residentRow.data },
  });
  if (error) return formError(registryErrorKey(error, 'verification.person'));
  revalidatePath(PATH);
  return {
    status: 'success',
    notice: useDeclared ? 'claimAccepted' : 'claimDiscarded',
  };
}

/**
 * Settles a plate claim. `verify` saves the vehicle as it is, which the database only allows once no other verified
 * vehicle holds the plate (`42501` otherwise: the competing claim has to be corrected or archived first); `discard`
 * archives this claim.
 */
export async function resolveVehicleClaimAction(
  vehicleId: string,
  choice: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('registry');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(vehicleId) || (choice !== 'verify' && choice !== 'discard'))
    return formError('denied');

  const pending = await loadPendingVerification(scope.client, scope.tenantId);
  const vehicle = pending.vehicles.find((row) => row.vehicle_id === vehicleId);
  if (!vehicle) return formError('denied');

  const { error } = await saveVehicle(scope.client, {
    target_tenant_id: scope.tenantId,
    target_unit_id: vehicle.unit.unit_id,
    client_event_id: crypto.randomUUID(),
    vehicle_data: {
      vehicle_id: vehicleId,
      vehicle_plate_code: vehicle.vehicle_plate_code,
      vehicle_make_name: vehicle.vehicle_make_name,
      vehicle_model_name: vehicle.vehicle_model_name,
      vehicle_color_name: vehicle.vehicle_color_name,
      ...(choice === 'discard'
        ? { vehicle_archived_at: new Date().toISOString() }
        : {}),
    },
  });
  if (error) {
    // A verified vehicle already holds the plate: the uniform denial means "resolve the other claim first".
    if (error.code === '42501' && choice === 'verify')
      return formError('plateHeld');
    return formError(registryErrorKey(error, 'verification.vehicle'));
  }
  revalidatePath(PATH);
  return {
    status: 'success',
    notice: choice === 'verify' ? 'plateVerified' : 'plateDiscarded',
  };
}
