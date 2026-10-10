import { isBillableUnit } from '@domus/domain/registry';
import { UNIT_PAGE_SIZE } from '@domus/domain/registry-ui';
import type { UnitListFilters } from '@domus/domain/registry-ui';
import { billableUnitCount, unitSheet } from '@domus/supabase/registry';
import type { UnitSheet } from '@domus/supabase/registry';
import type { Database } from '@domus/supabase/database.types';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';
import { sanitizeSearch } from '@/lib/platform/data';

type Tables = Database['public']['Tables'];
type UnitStatus = Database['public']['Enums']['unit_status'];

export interface UnitListItem {
  unit_id: string;
  unit_code: string;
  unit_block_code: string | null;
  unit_lot_number: string | null;
  unit_status: UnitStatus;
  unit_coefficient: number;
  unit_is_billable: boolean | null;
  unit_archived_at: string | null;
  /** Billable once the tenant's criteria and the unit's own override are applied. */
  billable: boolean;
  /** Residents whose residence is open (no end date). */
  resident_count: number;
}

export interface UnitPage {
  units: UnitListItem[];
  total: number;
  pageSize: number;
}

interface UnitListRow {
  unit_id: string;
  unit_code: string;
  unit_block_code: string | null;
  unit_lot_number: string | null;
  unit_status: UnitStatus;
  unit_coefficient: number;
  unit_is_billable: boolean | null;
  unit_archived_at: string | null;
  residents: { count: number }[];
}

/** Statuses counted as billable by the barrio's criteria (D20); the H1 default is all three. */
export async function loadBillableCriteria(
  client: Client,
  tenantId: string,
): Promise<UnitStatus[]> {
  const { data, error } = await client
    .from('tenant')
    .select('tenant_billable_unit_statuses')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load billing criteria (${error.code})`);
  return data?.tenant_billable_unit_statuses ?? [];
}

/** Number of billable units of the barrio (M01-F03). The database function applies criteria, overrides and archival. */
export async function loadBillableCount(
  client: Client,
  tenantId: string,
): Promise<number | null> {
  const { data, error } = await billableUnitCount(client, {
    target_tenant_id: tenantId,
  });
  if (error || data === null) return null;
  return Number(data);
}

/** Distinct block codes of the barrio, for the block filter. */
export async function listBlockCodes(
  client: Client,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from('unit')
    .select('unit_block_code')
    .eq('tenant_id', tenantId)
    .not('unit_block_code', 'is', null)
    .limit(5000);
  if (error) throw new Error(`Could not load blocks (${error.code})`);
  const blocks = new Set<string>();
  for (const row of data)
    if (row.unit_block_code) blocks.add(row.unit_block_code);
  return [...blocks].sort((a, b) =>
    a.localeCompare(b, 'es-AR', { numeric: true }),
  );
}

/** One page of units with the filters of the list; `criteria` are the barrio's billable statuses. */
export async function listUnits(
  client: Client,
  tenantId: string,
  filters: UnitListFilters,
  criteria: readonly UnitStatus[],
): Promise<UnitPage> {
  const from = (filters.page - 1) * UNIT_PAGE_SIZE;
  let query = client
    .from('unit')
    .select(
      `unit_id, unit_code, unit_block_code, unit_lot_number, unit_status, unit_coefficient, unit_is_billable,
       unit_archived_at, residents:unit_resident(count)`,
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)
    .is('residents.unit_resident_valid_to_at', null)
    .order('unit_code', { ascending: true })
    .range(from, from + UNIT_PAGE_SIZE - 1);

  query = filters.archived
    ? query.not('unit_archived_at', 'is', null)
    : query.is('unit_archived_at', null);
  const term = sanitizeSearch(filters.q);
  if (term)
    query = query.or(
      `unit_code.ilike.%${term}%,unit_lot_number.ilike.%${term}%,unit_block_code.ilike.%${term}%`,
    );
  if (filters.status) query = query.eq('unit_status', filters.status);
  if (filters.block) query = query.eq('unit_block_code', filters.block);
  if (filters.billable) {
    const list = criteria.length > 0 ? criteria.join(',') : 'vacant';
    query = query.is('unit_archived_at', null);
    query =
      filters.billable === 'yes'
        ? query.or(
            `unit_is_billable.eq.true,and(unit_is_billable.is.null,unit_status.in.(${list}))`,
          )
        : query.or(
            `unit_is_billable.eq.false,and(unit_is_billable.is.null,unit_status.not.in.(${list}))`,
          );
  }

  const { data, error, count } = await query.returns<UnitListRow[]>();
  if (error) throw new Error(`Could not load units (${error.code})`);
  return {
    total: count ?? data.length,
    pageSize: UNIT_PAGE_SIZE,
    units: data.map(({ residents, ...unit }) => ({
      ...unit,
      resident_count: residents[0]?.count ?? 0,
      billable: isBillableUnit(
        unit.unit_status,
        unit.unit_is_billable,
        criteria,
        unit.unit_archived_at !== null,
      ),
    })),
  };
}

export type { UnitSheet };

/** The 360 sheet of one unit (`unit_sheet`), or null when the unit does not exist or is not visible. */
export async function loadUnitSheet(
  client: Client,
  tenantId: string,
  unitId: string,
): Promise<UnitSheet | null> {
  const { data, error } = await unitSheet(client, {
    target_tenant_id: tenantId,
    target_unit_id: unitId,
  });
  if (error) {
    if (error.code === '42501') return null;
    throw new Error(`Could not load the unit (${error.code})`);
  }
  return data as unknown as UnitSheet | null;
}

export type PersonSummary = Pick<
  Tables['person']['Row'],
  | 'person_id'
  | 'person_first_name'
  | 'person_last_name'
  | 'person_email'
  | 'person_document_type'
  | 'person_document_number'
>;

/** Names of the people behind a set of ids (the sheet's membership rows carry only `person_id`). */
export async function loadPeople(
  client: Client,
  tenantId: string,
  personIds: readonly string[],
): Promise<Map<string, PersonSummary>> {
  const people = new Map<string, PersonSummary>();
  if (personIds.length === 0) return people;
  const { data, error } = await client
    .from('person')
    .select(
      'person_id, person_first_name, person_last_name, person_email, person_document_type, person_document_number',
    )
    .eq('tenant_id', tenantId)
    .in('person_id', [...personIds]);
  if (error) throw new Error(`Could not load people (${error.code})`);
  for (const person of data) people.set(person.person_id, person);
  return people;
}

export interface GuardItem {
  membership_id: string;
  membership_status: Database['public']['Enums']['membership_status'];
  membership_valid_from: string;
  membership_valid_to: string | null;
  person_first_name: string;
  person_last_name: string;
  person_email: string | null;
  gate_ids: string[];
}

interface GuardRow {
  membership_id: string;
  membership_status: GuardItem['membership_status'];
  membership_valid_from: string;
  membership_valid_to: string | null;
  person: {
    person_first_name: string;
    person_last_name: string;
    person_email: string | null;
  };
  gate_guard: { gate_id: string }[];
}

/** Guard memberships of the barrio with the gates each one is assigned to. */
export async function listGuards(
  client: Client,
  tenantId: string,
): Promise<GuardItem[]> {
  const { data, error } = await client
    .from('membership')
    .select(
      `membership_id, membership_status, membership_valid_from, membership_valid_to,
       person!inner(person_first_name, person_last_name, person_email), gate_guard(gate_id)`,
    )
    .eq('tenant_id', tenantId)
    .eq('membership_role', 'guard')
    .order('membership_created_at', { ascending: true })
    .returns<GuardRow[]>();
  if (error) throw new Error(`Could not load guards (${error.code})`);
  return data.map(({ person, gate_guard, ...membership }) => ({
    ...membership,
    ...person,
    gate_ids: gate_guard.map((assignment) => assignment.gate_id),
  }));
}

export type GuardInvitationRow = Pick<
  Tables['invitation']['Row'],
  | 'invitation_id'
  | 'invitation_email'
  | 'invitation_first_name'
  | 'invitation_last_name'
  | 'invitation_status'
  | 'invitation_expires_at'
>;

/** Pending guard invitations of the barrio. */
export async function listGuardInvitations(
  client: Client,
  tenantId: string,
): Promise<GuardInvitationRow[]> {
  const { data, error } = await client
    .from('invitation')
    .select(
      'invitation_id, invitation_email, invitation_first_name, invitation_last_name, invitation_status, invitation_expires_at',
    )
    .eq('tenant_id', tenantId)
    .eq('invitation_membership_role', 'guard')
    .eq('invitation_status', 'pending')
    .order('invitation_created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`Could not load invitations (${error.code})`);
  return data;
}

export type GateRow = Pick<
  Tables['gate']['Row'],
  'gate_id' | 'gate_name' | 'gate_kind' | 'gate_is_active'
>;
export type DeviceRow = Pick<
  Tables['device']['Row'],
  | 'device_id'
  | 'gate_id'
  | 'device_name'
  | 'device_status'
  | 'device_last_sync_at'
  | 'device_created_at'
>;

export async function listGates(
  client: Client,
  tenantId: string,
): Promise<GateRow[]> {
  const { data, error } = await client
    .from('gate')
    .select('gate_id, gate_name, gate_kind, gate_is_active')
    .eq('tenant_id', tenantId)
    .order('gate_name', { ascending: true });
  if (error) throw new Error(`Could not load gates (${error.code})`);
  return data;
}

export async function listDevices(
  client: Client,
  tenantId: string,
): Promise<DeviceRow[]> {
  const { data, error } = await client
    .from('device')
    .select(
      'device_id, gate_id, device_name, device_status, device_last_sync_at, device_created_at',
    )
    .eq('tenant_id', tenantId)
    .order('device_created_at', { ascending: false });
  if (error) throw new Error(`Could not load devices (${error.code})`);
  return data;
}
