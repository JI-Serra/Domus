// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TENANT = '10000000-0000-4000-8000-000000000001';
const UNIT = '20000000-0000-4000-8000-000000000001';
const PERSON = '30000000-0000-4000-8000-000000000001';
const VEHICLE = '40000000-0000-4000-8000-000000000001';

const getAdminScope = vi.fn();
const saveResident = vi.fn();
const saveVehicle = vi.fn();
const loadPendingVerification = vi.fn();
const revalidatePath = vi.fn();
const fromTable = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/registry/guard', async (original) => ({
  ...(await original<typeof import('@/lib/registry/guard')>()),
  getAdminScope: (...args: unknown[]) => getAdminScope(...args),
}));
vi.mock('@/lib/registry/verification', () => ({
  loadPendingVerification: (...args: unknown[]) =>
    loadPendingVerification(...args),
}));
vi.mock('@domus/supabase/registry', () => ({
  saveResident: (...args: unknown[]) => saveResident(...args),
  saveVehicle: (...args: unknown[]) => saveVehicle(...args),
}));

const verification = await import('./actions');

const pendingPerson = {
  person_id: PERSON,
  person_first_name: 'Ana',
  person_last_name: 'Gómez',
  registered: {
    documentType: 'dni',
    documentNumber: '111',
    email: 'old@x.com',
  },
  declared: { documentType: 'passport', documentNumber: 'P222', email: null },
  unit: { unit_id: UNIT, unit_code: 'Mz 1' },
  holders: [],
};
const pendingVehicle = {
  vehicle_id: VEHICLE,
  vehicle_plate_code: 'AB123CD',
  vehicle_make_name: 'Fiat',
  vehicle_model_name: null,
  vehicle_color_name: 'Rojo',
  unit: { unit_id: UNIT, unit_code: 'Mz 1' },
  holders: [],
};

function single(data: unknown) {
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ data, error: null }),
  };
  for (const name of ['select', 'eq', 'maybeSingle']) chain[name] = () => chain;
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminScope.mockResolvedValue({
    client: { from: fromTable },
    tenantId: TENANT,
    membershipId: 'm',
    writable: true,
  });
  loadPendingVerification.mockResolvedValue({
    people: [pendingPerson],
    vehicles: [pendingVehicle],
  });
  fromTable.mockImplementation((table: string) =>
    table === 'person'
      ? single({ person_phone: '+54 381', person_birth_date: '1980-01-01' })
      : single({
          unit_resident_relationship: 'owner',
          unit_resident_is_holder: true,
          unit_resident_is_minor: false,
          unit_resident_valid_from_at: '2020-01-01T00:00:00Z',
          unit_resident_valid_to_at: null,
        }),
  );
});

describe('person claims', () => {
  it('accepts the declared data through save_resident with the explicit person, keeping the residence', async () => {
    saveResident.mockResolvedValue({ data: PERSON, error: null });
    expect(
      await verification.resolvePersonClaimAction(PERSON, 'declared'),
    ).toEqual({
      status: 'success',
      notice: 'claimAccepted',
    });
    const input = saveResident.mock.calls[0]?.[1];
    expect(input.target_unit_id).toBe(UNIT);
    expect(input.person_data).toMatchObject({
      person_id: PERSON,
      person_document_type: 'passport',
      person_document_number: 'P222',
      person_email: 'old@x.com',
      person_phone: '+54 381',
      person_birth_date: '1980-01-01',
    });
    expect(input.resident_data).toMatchObject({
      unit_resident_is_holder: true,
      unit_resident_valid_from_at: '2020-01-01T00:00:00Z',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/registry/verification');
  });

  it('keeps the registered data on request', async () => {
    saveResident.mockResolvedValue({ data: PERSON, error: null });
    expect(
      await verification.resolvePersonClaimAction(PERSON, 'registered'),
    ).toMatchObject({ notice: 'claimDiscarded' });
    expect(saveResident.mock.calls[0]?.[1].person_data).toMatchObject({
      person_document_number: '111',
      person_email: 'old@x.com',
    });
  });

  it('words the identity refusal and rejects unknown people, choices and ids', async () => {
    saveResident.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'Person identity conflict' },
    });
    expect(
      await verification.resolvePersonClaimAction(PERSON, 'declared'),
    ).toMatchObject({ formError: 'identityTaken' });
    expect(
      await verification.resolvePersonClaimAction(VEHICLE, 'declared'),
    ).toMatchObject({ formError: 'denied' });
    expect(
      await verification.resolvePersonClaimAction(PERSON, 'merge'),
    ).toMatchObject({ formError: 'denied' });
    expect(
      await verification.resolvePersonClaimAction('x', 'declared'),
    ).toMatchObject({ formError: 'denied' });
    loadPendingVerification.mockResolvedValue({
      people: [{ ...pendingPerson, unit: null }],
      vehicles: [],
    });
    expect(
      await verification.resolvePersonClaimAction(PERSON, 'declared'),
    ).toMatchObject({ formError: 'noResidence' });
  });
});

describe('plate claims', () => {
  it('verifies a plate as it is, or archives the claim', async () => {
    saveVehicle.mockResolvedValue({ data: VEHICLE, error: null });
    expect(
      await verification.resolveVehicleClaimAction(VEHICLE, 'verify'),
    ).toMatchObject({ notice: 'plateVerified' });
    expect(saveVehicle.mock.calls[0]?.[1].vehicle_data).toEqual({
      vehicle_id: VEHICLE,
      vehicle_plate_code: 'AB123CD',
      vehicle_make_name: 'Fiat',
      vehicle_model_name: null,
      vehicle_color_name: 'Rojo',
    });
    expect(
      await verification.resolveVehicleClaimAction(VEHICLE, 'discard'),
    ).toMatchObject({ notice: 'plateDiscarded' });
    expect(
      saveVehicle.mock.calls[1]?.[1].vehicle_data.vehicle_archived_at,
    ).toBeTruthy();
  });

  it('explains a plate that another verified vehicle holds', async () => {
    saveVehicle.mockResolvedValue({ data: null, error: { code: '42501' } });
    expect(
      await verification.resolveVehicleClaimAction(VEHICLE, 'verify'),
    ).toMatchObject({ formError: 'plateHeld' });
    expect(
      await verification.resolveVehicleClaimAction(VEHICLE, 'discard'),
    ).toMatchObject({ formError: 'denied' });
    expect(
      await verification.resolveVehicleClaimAction(PERSON, 'verify'),
    ).toMatchObject({ formError: 'denied' });
    getAdminScope.mockResolvedValue(null);
    expect(
      await verification.resolveVehicleClaimAction(VEHICLE, 'verify'),
    ).toMatchObject({ formError: 'denied' });
  });
});
