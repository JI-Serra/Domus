import { registryPendingVerification } from '@domus/supabase/registry';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

/** How many pending records the page resolves at once; the database list is small by design (unresolved collisions). */
const MAX_PENDING = 50;

export interface PendingPerson {
  person_id: string;
  person_first_name: string;
  person_last_name: string;
  /** What the register holds for this person (canonical). */
  registered: {
    documentType: string | null;
    documentNumber: string | null;
    email: string | null;
  };
  /** What a household member declared for them and could not be promoted (it collides with somebody else). */
  declared: {
    documentType: string | null;
    documentNumber: string | null;
    email: string | null;
  };
  /** The unit through which the claim can be resolved (the person's most recent residence); null when they have none. */
  unit: { unit_id: string; unit_code: string } | null;
  /** Other people who already hold the declared document or email. */
  holders: {
    person_id: string;
    name: string;
    units: { unit_id: string; unit_code: string }[];
  }[];
}

export interface PendingVehicle {
  vehicle_id: string;
  vehicle_plate_code: string;
  vehicle_make_name: string | null;
  vehicle_model_name: string | null;
  vehicle_color_name: string | null;
  unit: { unit_id: string; unit_code: string };
  /** Verified vehicles that already hold this plate. */
  holders: {
    vehicle_id: string;
    unit: { unit_id: string; unit_code: string };
  }[];
}

export interface PendingVerification {
  people: PendingPerson[];
  vehicles: PendingVehicle[];
}

interface PersonRow {
  person_id: string;
  person_first_name: string;
  person_last_name: string;
  person_document_type: string | null;
  person_document_number: string | null;
  person_email: string | null;
  person_claimed_document_type: string | null;
  person_claimed_document_number: string | null;
  person_claimed_email: string | null;
}
interface VehicleRow {
  vehicle_id: string;
  unit_id: string;
  vehicle_plate_code: string;
  vehicle_make_name: string | null;
  vehicle_model_name: string | null;
  vehicle_color_name: string | null;
}

/** A value inside a PostgREST filter: quoted, with quotes and backslashes escaped, so it can never change the filter. */
const quoted = (value: string) =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * The people and vehicles whose claims are waiting for the registry (`registry_pending_verification`), with what a
 * person needs to decide: where each one lives, and who already holds the contested document, email or plate.
 */
export async function loadPendingVerification(
  client: Client,
  tenantId: string,
): Promise<PendingVerification> {
  const { data, error } = await registryPendingVerification(client, {
    target_tenant_id: tenantId,
  });
  if (error) {
    if (error.code === '42501') return { people: [], vehicles: [] };
    throw new Error(`Could not load pending verification (${error.code})`);
  }
  const body = (data ?? {}) as {
    people?: PersonRow[];
    vehicles?: VehicleRow[];
  };
  const people = (body.people ?? []).slice(0, MAX_PENDING);
  const vehicles = (body.vehicles ?? []).slice(0, MAX_PENDING);

  const personIds = people.map((person) => person.person_id);
  const residences =
    personIds.length === 0
      ? []
      : await client
          .from('unit_resident')
          .select('person_id, unit_id, unit_resident_valid_from_at')
          .eq('tenant_id', tenantId)
          .in('person_id', personIds)
          .order('unit_resident_valid_from_at', { ascending: false })
          .then(({ data: rows, error: failure }) => {
            if (failure)
              throw new Error(`Could not load residences (${failure.code})`);
            return rows;
          });

  // Everyone who holds one of the contested documents or emails (other than the claimant).
  const holderRows = new Map<string, PersonRow[]>();
  await Promise.all(
    people.map(async (person) => {
      const conditions: string[] = [];
      if (
        person.person_claimed_document_type &&
        person.person_claimed_document_number
      )
        conditions.push(
          `and(person_document_type.eq.${quoted(person.person_claimed_document_type)},person_document_number.eq.${quoted(person.person_claimed_document_number)})`,
        );
      if (person.person_claimed_email)
        conditions.push(
          `person_email.eq.${quoted(person.person_claimed_email)}`,
        );
      if (conditions.length === 0) return;
      const { data: rows, error: failure } = await client
        .from('person')
        .select(
          'person_id, person_first_name, person_last_name, person_document_type, person_document_number, person_email, person_claimed_document_type, person_claimed_document_number, person_claimed_email',
        )
        .eq('tenant_id', tenantId)
        .neq('person_id', person.person_id)
        .or(conditions.join(','))
        .limit(5);
      if (failure) throw new Error(`Could not load holders (${failure.code})`);
      holderRows.set(person.person_id, rows as PersonRow[]);
    }),
  );
  const holderIds = [
    ...new Set([...holderRows.values()].flat().map((row) => row.person_id)),
  ];
  const holderResidences =
    holderIds.length === 0
      ? []
      : await client
          .from('unit_resident')
          .select('person_id, unit_id')
          .eq('tenant_id', tenantId)
          .in('person_id', holderIds)
          .then(({ data: rows, error: failure }) => {
            if (failure)
              throw new Error(`Could not load residences (${failure.code})`);
            return rows;
          });

  // `vehicle_is_verified` is not a readable column for tenant clients: the verified holders of a plate are the other
  // active vehicles with it that the pending list does not contain.
  const pendingIds = new Set(vehicles.map((vehicle) => vehicle.vehicle_id));
  const plateHolders = new Map<
    string,
    { vehicle_id: string; unit_id: string }[]
  >();
  await Promise.all(
    vehicles.map(async (vehicle) => {
      const { data: rows, error: failure } = await client
        .from('vehicle')
        .select('vehicle_id, unit_id')
        .eq('tenant_id', tenantId)
        .eq('vehicle_plate_code', vehicle.vehicle_plate_code)
        .is('vehicle_archived_at', null)
        .neq('vehicle_id', vehicle.vehicle_id)
        .limit(10);
      if (failure)
        throw new Error(`Could not load plate holders (${failure.code})`);
      plateHolders.set(
        vehicle.vehicle_id,
        rows.filter((row) => !pendingIds.has(row.vehicle_id)),
      );
    }),
  );

  const unitIds = [
    ...new Set([
      ...residences.map((row) => row.unit_id),
      ...holderResidences.map((row) => row.unit_id),
      ...vehicles.map((row) => row.unit_id),
      ...[...plateHolders.values()].flat().map((row) => row.unit_id),
    ]),
  ];
  const codes = new Map<string, string>();
  if (unitIds.length > 0) {
    const { data: rows, error: failure } = await client
      .from('unit')
      .select('unit_id, unit_code')
      .eq('tenant_id', tenantId)
      .in('unit_id', unitIds);
    if (failure) throw new Error(`Could not load units (${failure.code})`);
    for (const row of rows) codes.set(row.unit_id, row.unit_code);
  }
  const unitOf = (unitId: string) => ({
    unit_id: unitId,
    unit_code: codes.get(unitId) ?? '—',
  });

  return {
    people: people.map((person) => {
      const home = residences.find((row) => row.person_id === person.person_id);
      return {
        person_id: person.person_id,
        person_first_name: person.person_first_name,
        person_last_name: person.person_last_name,
        registered: {
          documentType: person.person_document_type,
          documentNumber: person.person_document_number,
          email: person.person_email,
        },
        declared: {
          documentType: person.person_claimed_document_type,
          documentNumber: person.person_claimed_document_number,
          email: person.person_claimed_email,
        },
        unit: home ? unitOf(home.unit_id) : null,
        holders: (holderRows.get(person.person_id) ?? []).map((holder) => ({
          person_id: holder.person_id,
          name: `${holder.person_first_name} ${holder.person_last_name}`,
          units: holderResidences
            .filter((row) => row.person_id === holder.person_id)
            .map((row) => unitOf(row.unit_id)),
        })),
      };
    }),
    vehicles: vehicles.map((vehicle) => ({
      vehicle_id: vehicle.vehicle_id,
      vehicle_plate_code: vehicle.vehicle_plate_code,
      vehicle_make_name: vehicle.vehicle_make_name,
      vehicle_model_name: vehicle.vehicle_model_name,
      vehicle_color_name: vehicle.vehicle_color_name,
      unit: unitOf(vehicle.unit_id),
      holders: (plateHolders.get(vehicle.vehicle_id) ?? []).map((holder) => ({
        vehicle_id: holder.vehicle_id,
        unit: unitOf(holder.unit_id),
      })),
    })),
  };
}
