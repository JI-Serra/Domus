// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData, navigatesTo, redirect } from '@/test/server-mocks';

const TENANT = '10000000-0000-4000-8000-000000000001';
const UNIT = '20000000-0000-4000-8000-000000000001';
const PERSON = '30000000-0000-4000-8000-000000000001';
const EVENT = '80000000-0000-4000-8000-000000000001';
const GATE = '40000000-0000-4000-8000-000000000001';
const MEMBERSHIP = '50000000-0000-4000-8000-000000000001';

const rpc = vi.fn();
const getAdminScope = vi.fn();
const registry = {
  saveUnit: vi.fn(),
  archiveUnit: vi.fn(),
  saveResident: vi.fn(),
  saveVehicle: vi.fn(),
  savePet: vi.fn(),
  rotateUnitJoinCode: vi.fn(),
  decideUnitJoinRequest: vi.fn(),
  revokeResidentInvitation: vi.fn(),
  sendResidentInvitation: vi.fn(),
  saveGate: vi.fn(),
  createDevicePairing: vi.fn(),
  revokeDevice: vi.fn(),
  assignGuardGate: vi.fn(),
  redeemDevicePairing: vi.fn(),
  createRegistryImport: vi.fn(),
  previewRegistryImport: vi.fn(),
  confirmRegistryImport: vi.fn(),
};
const sendInvitation = vi.fn();
const revokeInvitation = vi.fn();
const loadUnitSheet = vi.fn();
const revalidatePath = vi.fn();
const cookieSet = vi.fn();
const canPairDevices = vi.fn();
const fromTable = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
  headers: async () => new Headers({ host: '127.0.0.1:3001' }),
}));
vi.mock('@domus/observability', () => ({ reportError: vi.fn() }));
vi.mock('@/lib/registry/guard', async (original) => ({
  ...(await original<typeof import('@/lib/registry/guard')>()),
  getAdminScope: (...args: unknown[]) => getAdminScope(...args),
}));
vi.mock('@/lib/registry/data', () => ({
  loadUnitSheet: (...args: unknown[]) => loadUnitSheet(...args),
}));
vi.mock('@/lib/devices/access', () => ({
  canPairDevices: () => canPairDevices(),
}));
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: async () => ({ rpc }),
}));
vi.mock('@domus/supabase/registry', () =>
  Object.fromEntries(
    Object.entries(registry).map(([name, fn]) => [
      name,
      (...args: unknown[]) => fn(...args),
    ]),
  ),
);
vi.mock('@domus/supabase/platform', () => ({
  sendInvitation: (...args: unknown[]) => sendInvitation(...args),
  revokeInvitation: (...args: unknown[]) => revokeInvitation(...args),
}));

const units = await import('./units/actions');
const gates = await import('./gates/actions');
const guards = await import('./guards/actions');
const importing = await import('./import/actions');
const pairing = await import('../devices/pair/actions');

const IDLE = { status: 'idle' } as const;
const ok = { data: null, error: null };

function scope(writable = true) {
  return {
    client: { rpc, from: fromTable },
    tenantId: TENANT,
    membershipId: 'm',
    writable,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAdminScope.mockResolvedValue(scope());
  canPairDevices.mockResolvedValue(TENANT);
});

const unitForm = (overrides: Record<string, string> = {}) =>
  formData({
    unit_code: 'Mz 1 Lote 2',
    unit_block_code: '1',
    unit_lot_number: '2',
    unit_status: 'vacant',
    unit_coefficient: '1,5',
    unit_is_billable: 'inherit',
    unit_contact_phone: '',
    unit_backup_phone: '',
    client_event_id: EVENT,
    ...overrides,
  });

describe('every registry action starts with the permission and the writable barrio', () => {
  it('refuses without the permission and in a read-only barrio', async () => {
    getAdminScope.mockResolvedValue(null);
    expect(await units.saveUnitAction(null, IDLE, unitForm())).toMatchObject({
      status: 'error',
      formError: 'denied',
    });
    expect(getAdminScope).toHaveBeenCalledWith('registry');

    getAdminScope.mockResolvedValue(scope(false));
    expect(await units.archiveUnitAction(UNIT)).toMatchObject({
      formError: 'readOnly',
    });
    expect(await gates.revokeDeviceAction(GATE)).toMatchObject({
      formError: 'readOnly',
    });
    expect(registry.archiveUnit).not.toHaveBeenCalled();
    expect(registry.revokeDevice).not.toHaveBeenCalled();
  });

  it('asks for the guards permission for gates and devices, and registry for guards', async () => {
    registry.saveGate.mockResolvedValue({ data: GATE, error: null });
    await gates.saveGateAction(
      null,
      IDLE,
      formData({
        gate_name: 'Norte',
        gate_kind: 'vehicular',
        client_event_id: EVENT,
      }),
    );
    expect(getAdminScope).toHaveBeenLastCalledWith('guards');
    rpc.mockResolvedValue(ok);
    registry.assignGuardGate.mockResolvedValue(ok);
    await guards.deactivateGuardAction(MEMBERSHIP);
    expect(getAdminScope).toHaveBeenLastCalledWith('registry');
    await guards.assignGuardGateAction(MEMBERSHIP, GATE, true);
    expect(getAdminScope).toHaveBeenLastCalledWith('guards');
  });
});

describe('units', () => {
  it('returns field messages without calling the database', async () => {
    const answer = await units.saveUnitAction(
      null,
      IDLE,
      unitForm({ unit_code: '', unit_coefficient: '-1' }),
    );
    expect(answer).toMatchObject({
      status: 'error',
      errors: {
        unit_code: 'unitCodeRequired',
        unit_coefficient: 'coefficientInvalid',
      },
    });
    expect(registry.saveUnit).not.toHaveBeenCalled();
  });

  it('creates an occupied unit together with its first holder', async () => {
    registry.saveUnit.mockResolvedValue({ data: UNIT, error: null });
    const form = unitForm({
      unit_status: 'occupied',
      holder_person_first_name: 'Ana',
      holder_person_last_name: 'Gómez',
      holder_person_document_type: 'dni',
      holder_person_document_number: '123',
      holder_person_email: 'ANA@x.com',
    });
    expect(
      await navigatesTo(() => units.saveUnitAction(null, IDLE, form)),
    ).toBe(`/registry/units/${UNIT}`);
    const input = registry.saveUnit.mock.calls[0]?.[1];
    expect(input.unit_data).toMatchObject({
      unit_code: 'Mz 1 Lote 2',
      unit_coefficient: 1.5,
      unit_is_billable: null,
      unit_status: 'occupied',
    });
    expect(input.unit_data.unit_id).toBeUndefined();
    expect(input.residents).toEqual([
      {
        person: expect.objectContaining({
          person_first_name: 'Ana',
          person_email: 'ana@x.com',
        }),
        resident: {
          unit_resident_relationship: 'owner',
          unit_resident_is_holder: true,
          unit_resident_is_minor: false,
        },
      },
    ]);
  });

  it('asks the holder for the same care when the unit is occupied', async () => {
    const answer = await units.saveUnitAction(
      null,
      IDLE,
      unitForm({ unit_status: 'occupied' }),
    );
    expect(answer).toMatchObject({
      status: 'error',
      errors: {
        holder_person_first_name: 'firstNameRequired',
        holder_person_last_name: 'lastNameRequired',
        holder_person_email: 'identityRequired',
      },
    });
  });

  it('edits the unit it was given and maps database errors to message keys', async () => {
    registry.saveUnit.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'occupied unit requires holder' },
    });
    expect(
      await units.saveUnitAction(
        UNIT,
        IDLE,
        unitForm({ unit_status: 'occupied' }),
      ),
    ).toMatchObject({ formError: 'occupiedNeedsHolder' });
    expect(registry.saveUnit.mock.calls[0]?.[1].unit_data.unit_id).toBe(UNIT);

    registry.saveUnit.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'unit_tenant_id_unit_code_key' },
    });
    expect(await units.saveUnitAction(UNIT, IDLE, unitForm())).toMatchObject({
      formError: 'unitCodeTaken',
    });
  });

  it('rejects a malformed idempotency key or unit id', async () => {
    expect(
      await units.saveUnitAction(
        null,
        IDLE,
        unitForm({ client_event_id: 'x' }),
      ),
    ).toMatchObject({ formError: 'unknown' });
    expect(await units.archiveUnitAction('nope')).toMatchObject({
      formError: 'denied',
    });
  });

  it('archives and goes back to the list', async () => {
    registry.archiveUnit.mockResolvedValue(ok);
    expect(await navigatesTo(() => units.archiveUnitAction(UNIT))).toBe(
      '/registry/units',
    );
    expect(registry.archiveUnit.mock.calls[0]?.[1]).toMatchObject({
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
    });
  });
});

const sheetWith = (overrides: Record<string, unknown> = {}) => ({
  residents: [
    {
      person_id: PERSON,
      person_first_name: 'Ana',
      person_last_name: 'Gómez',
      person_document_type: 'dni',
      person_document_number: '123',
      person_email: 'ana@x.com',
      person_phone: null,
      person_birth_date: null,
      unit_resident_relationship: 'owner',
      unit_resident_is_holder: true,
      unit_resident_is_minor: false,
      unit_resident_valid_from_at: '2020-01-01T00:00:00Z',
      unit_resident_valid_to_at: null,
    },
  ],
  vehicles: [
    {
      vehicle_id: GATE,
      vehicle_plate_code: 'AB123CD',
      vehicle_make_name: 'Fiat',
      vehicle_model_name: null,
      vehicle_color_name: null,
    },
  ],
  pets: [
    {
      pet_id: GATE,
      pet_name: 'Luna',
      pet_species_name: 'dog',
      pet_breed_name: null,
      pet_photo_path: 'a/b/c.png',
    },
  ],
  pending_join_requests: [
    {
      unit_join_request_id: MEMBERSHIP,
      unit_join_request_email: 'req@x.com',
    },
  ],
  ...overrides,
});

describe('residents', () => {
  const residentForm = (overrides: Record<string, string> = {}) =>
    formData({
      person_first_name: 'Ana',
      person_last_name: 'Gómez',
      person_document_type: 'dni',
      person_document_number: '123',
      person_email: 'ana@x.com',
      person_phone: '',
      person_birth_date: '',
      unit_resident_relationship: 'owner',
      client_event_id: EVENT,
      ...overrides,
    });

  it('adds a resident without touching the residence period', async () => {
    registry.saveResident.mockResolvedValue({ data: PERSON, error: null });
    const answer = await units.saveResidentAction(
      UNIT,
      null,
      IDLE,
      residentForm(),
    );
    expect(answer).toEqual({ status: 'success', notice: 'residentAdded' });
    const input = registry.saveResident.mock.calls[0]?.[1];
    expect(input.person_data.person_id).toBeUndefined();
    expect(input.resident_data).toEqual({
      unit_resident_relationship: 'owner',
      unit_resident_is_holder: false,
      unit_resident_is_minor: false,
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/registry/units/${UNIT}`);
  });

  it('keeps the stored residence period when editing (the RPC replaces what it is not given)', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.saveResident.mockResolvedValue({ data: PERSON, error: null });
    await units.saveResidentAction(
      UNIT,
      PERSON,
      IDLE,
      residentForm({ unit_resident_is_holder: 'on' }),
    );
    const input = registry.saveResident.mock.calls[0]?.[1];
    expect(input.person_data.person_id).toBe(PERSON);
    expect(input.resident_data).toMatchObject({
      unit_resident_is_holder: true,
      unit_resident_valid_from_at: '2020-01-01T00:00:00Z',
      unit_resident_valid_to_at: null,
    });
  });

  it('refuses a minor holder and an unknown person', async () => {
    expect(
      await units.saveResidentAction(
        UNIT,
        null,
        IDLE,
        residentForm({
          unit_resident_is_holder: 'on',
          unit_resident_is_minor: 'on',
        }),
      ),
    ).toMatchObject({ errors: { unit_resident_is_holder: 'holderMinor' } });
    loadUnitSheet.mockResolvedValue(sheetWith({ residents: [] }));
    expect(
      await units.saveResidentAction(UNIT, PERSON, IDLE, residentForm()),
    ).toMatchObject({ formError: 'denied' });
  });

  it('ends a residence by saving the resident with an end date, and surfaces the holder rule', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.saveResident.mockResolvedValue({
      data: null,
      error: { code: '23514', message: 'holder required' },
    });
    expect(await units.endResidenceAction(UNIT, PERSON)).toMatchObject({
      formError: 'occupiedNeedsHolder',
    });
    const resident = registry.saveResident.mock.calls[0]?.[1].resident_data;
    expect(resident.unit_resident_valid_to_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(resident.unit_resident_valid_from_at).toBe('2020-01-01T00:00:00Z');

    registry.saveResident.mockResolvedValue({ data: PERSON, error: null });
    expect(await units.endResidenceAction(UNIT, PERSON)).toEqual({
      status: 'success',
      notice: 'residenceEnded',
    });
  });
});

describe('invitations and join requests', () => {
  const inviteForm = (overrides: Record<string, string> = {}) =>
    formData({
      invited_email: 'ANA@x.com',
      target_role: 'household_member',
      mode: 'email',
      client_event_id: EVENT,
      ...overrides,
    });

  it('sends the invitation by email through the Edge Function, bound to the person', async () => {
    registry.sendResidentInvitation.mockResolvedValue({
      data: {},
      error: null,
    });
    expect(
      await units.inviteResidentAction(UNIT, PERSON, IDLE, inviteForm()),
    ).toEqual({ status: 'success', notice: 'invitationSent' });
    expect(registry.sendResidentInvitation.mock.calls[0]?.[1]).toEqual({
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      invited_email: 'ana@x.com',
      target_role: 'household_member',
      client_event_id: EVENT,
      target_person_id: PERSON,
    });
  });

  it('words Edge Function failures', async () => {
    const failure = (code: string) => ({
      error: {
        context: new Response(JSON.stringify({ code }), { status: 400 }),
      },
    });
    registry.sendResidentInvitation.mockResolvedValue(
      failure('delivery_failed'),
    );
    expect(
      await units.inviteResidentAction(UNIT, PERSON, IDLE, inviteForm()),
    ).toMatchObject({ formError: 'deliveryFailed' });
    registry.sendResidentInvitation.mockResolvedValue(failure('invalid_input'));
    expect(
      await units.inviteResidentAction(UNIT, PERSON, IDLE, inviteForm()),
    ).toMatchObject({ formError: 'inviteInvalid' });
    registry.sendResidentInvitation.mockResolvedValue(failure('forbidden'));
    expect(
      await units.inviteResidentAction(UNIT, PERSON, IDLE, inviteForm()),
    ).toMatchObject({ formError: 'denied' });
  });

  it('hands over a one-time link once and marks the invitation delivered', async () => {
    const token = 'a'.repeat(64);
    rpc.mockImplementation(async (name: string) =>
      name === 'create_resident_invitation'
        ? {
            data: [{ invitation_id: MEMBERSHIP, invitation_token: token }],
            error: null,
          }
        : ok,
    );
    const answer = await units.inviteResidentAction(
      UNIT,
      PERSON,
      IDLE,
      inviteForm({ mode: 'link' }),
    );
    expect(answer).toEqual({
      status: 'success',
      notice: 'invitationLink',
      value: `http://127.0.0.1:3001/invitations/accept?token=${token}`,
    });
    expect(rpc).toHaveBeenCalledWith('mark_resident_invitation_delivered', {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      target_invitation_id: MEMBERSHIP,
    });
  });

  it('does not invent a link when the invitation was already delivered', async () => {
    rpc.mockResolvedValue({
      data: [{ invitation_id: MEMBERSHIP, invitation_token: null }],
      error: null,
    });
    expect(
      await units.inviteResidentAction(
        UNIT,
        PERSON,
        IDLE,
        inviteForm({ mode: 'link' }),
      ),
    ).toMatchObject({ formError: 'linkUnavailable' });
  });

  it('rejects invalid input before any call', async () => {
    expect(
      await units.inviteResidentAction(
        UNIT,
        PERSON,
        IDLE,
        inviteForm({ invited_email: 'nope', target_role: 'guard' }),
      ),
    ).toMatchObject({
      errors: { invited_email: 'emailInvalid', target_role: 'roleInvalid' },
    });
  });

  it('approving a request delivers the invitation the decision created', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.decideUnitJoinRequest.mockResolvedValue({
      data: {
        status: 'approved',
        invitation_client_event_id: EVENT,
        person_id: PERSON,
      },
      error: null,
    });
    registry.sendResidentInvitation.mockResolvedValue({
      data: {},
      error: null,
    });
    expect(
      await units.decideJoinRequestAction(
        UNIT,
        MEMBERSHIP,
        true,
        'unit_holder',
      ),
    ).toEqual({ status: 'success', notice: 'requestApproved' });
    expect(registry.decideUnitJoinRequest.mock.calls[0]?.[1]).toMatchObject({
      approve: true,
      target_role: 'unit_holder',
    });
    expect(registry.sendResidentInvitation.mock.calls[0]?.[1]).toMatchObject({
      invited_email: 'req@x.com',
      client_event_id: EVENT,
      target_person_id: PERSON,
      target_role: 'unit_holder',
    });
  });

  it('keeps an approval whose email could not be sent, and says so', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.decideUnitJoinRequest.mockResolvedValue({
      data: {
        status: 'approved',
        invitation_client_event_id: EVENT,
        person_id: PERSON,
      },
      error: null,
    });
    registry.sendResidentInvitation.mockResolvedValue({
      error: new Error('boom'),
    });
    expect(
      await units.decideJoinRequestAction(UNIT, MEMBERSHIP, true, 'x'),
    ).toEqual({ status: 'success', notice: 'requestApprovedNotSent' });
    expect(registry.decideUnitJoinRequest.mock.calls[0]?.[1].target_role).toBe(
      'household_member',
    );
  });

  it('keeps the request pending and explains an identity collision', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.decideUnitJoinRequest.mockResolvedValue({
      data: { status: 'identity_conflict' },
      error: null,
    });
    expect(
      await units.decideJoinRequestAction(
        UNIT,
        MEMBERSHIP,
        true,
        'household_member',
      ),
    ).toMatchObject({ formError: 'identityConflict' });
    expect(registry.sendResidentInvitation).not.toHaveBeenCalled();
  });

  it('rejects without sending anything, and ignores a request that is not on the unit', async () => {
    loadUnitSheet.mockResolvedValue(sheetWith());
    registry.decideUnitJoinRequest.mockResolvedValue({
      data: { status: 'rejected' },
      error: null,
    });
    expect(
      await units.decideJoinRequestAction(
        UNIT,
        MEMBERSHIP,
        false,
        'household_member',
      ),
    ).toEqual({ status: 'success', notice: 'requestRejected' });
    expect(registry.sendResidentInvitation).not.toHaveBeenCalled();

    loadUnitSheet.mockResolvedValue(sheetWith({ pending_join_requests: [] }));
    expect(
      await units.decideJoinRequestAction(
        UNIT,
        MEMBERSHIP,
        true,
        'household_member',
      ),
    ).toMatchObject({ formError: 'denied' });
  });

  it('revokes an invitation and rotates the join code, returning the code once', async () => {
    registry.revokeResidentInvitation.mockResolvedValue(ok);
    expect(await units.revokeInvitationAction(UNIT, MEMBERSHIP)).toEqual({
      status: 'success',
      notice: 'invitationRevoked',
    });
    registry.rotateUnitJoinCode.mockResolvedValue({
      data: 'ABCD-EFGH-JKLM',
      error: null,
    });
    expect(await units.rotateJoinCodeAction(UNIT)).toEqual({
      status: 'success',
      notice: 'codeRotated',
      value: 'ABCD-EFGH-JKLM',
    });
    registry.rotateUnitJoinCode.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    expect(await units.rotateJoinCodeAction(UNIT)).toMatchObject({
      formError: 'denied',
    });
  });
});

describe('vehicles and pets', () => {
  it('saves a vehicle with a normalized plate and archives it with its data intact', async () => {
    registry.saveVehicle.mockResolvedValue({ data: GATE, error: null });
    expect(
      await units.saveVehicleAction(
        UNIT,
        null,
        IDLE,
        formData({
          vehicle_plate_code: 'ab 123-cd',
          vehicle_make_name: 'Fiat',
          vehicle_model_name: '',
          vehicle_color_name: '',
          client_event_id: EVENT,
        }),
      ),
    ).toEqual({ status: 'success', notice: 'vehicleAdded' });
    expect(registry.saveVehicle.mock.calls[0]?.[1].vehicle_data).toMatchObject({
      vehicle_plate_code: 'AB123CD',
      vehicle_make_name: 'Fiat',
    });

    loadUnitSheet.mockResolvedValue(sheetWith());
    await units.archiveVehicleAction(UNIT, GATE);
    expect(registry.saveVehicle.mock.calls[1]?.[1].vehicle_data).toMatchObject({
      vehicle_id: GATE,
      vehicle_plate_code: 'AB123CD',
      vehicle_archived_at: expect.stringMatching(/^\d{4}-/),
    });
    registry.saveVehicle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'vehicle plate key' },
    });
    expect(
      await units.saveVehicleAction(
        UNIT,
        null,
        IDLE,
        formData({ vehicle_plate_code: 'AB123CD', client_event_id: EVENT }),
      ),
    ).toMatchObject({ formError: 'plateTaken' });
  });

  it('keeps the photo of a pet when editing and archiving', async () => {
    registry.savePet.mockResolvedValue({ data: GATE, error: null });
    loadUnitSheet.mockResolvedValue(sheetWith());
    await units.savePetAction(
      UNIT,
      GATE,
      IDLE,
      formData({
        pet_name: 'Luna',
        pet_species_name: 'dog',
        pet_breed_name: '',
        client_event_id: EVENT,
      }),
    );
    expect(registry.savePet.mock.calls[0]?.[1].pet_data).toMatchObject({
      pet_id: GATE,
      pet_photo_path: 'a/b/c.png',
    });
    await units.archivePetAction(UNIT, GATE);
    expect(
      registry.savePet.mock.calls[1]?.[1].pet_data.pet_archived_at,
    ).toBeTruthy();
    expect(
      await units.savePetAction(
        UNIT,
        null,
        IDLE,
        formData({ client_event_id: EVENT }),
      ),
    ).toMatchObject({
      errors: {
        pet_name: 'petNameRequired',
        pet_species_name: 'petSpeciesRequired',
      },
    });
  });
});

describe('gates, guards and devices', () => {
  it('saves a gate (the active switch is a checkbox)', async () => {
    registry.saveGate.mockResolvedValue({ data: GATE, error: null });
    const form = formData({
      gate_name: 'Norte',
      gate_kind: 'pedestrian',
      gate_is_active: 'on',
      client_event_id: EVENT,
    });
    expect(await gates.saveGateAction(null, IDLE, form)).toEqual({
      status: 'success',
      notice: 'gateCreated',
    });
    expect(registry.saveGate.mock.calls[0]?.[1].gate_data).toEqual({
      gate_name: 'Norte',
      gate_kind: 'pedestrian',
      gate_is_active: true,
    });
    expect(
      await gates.saveGateAction(
        GATE,
        IDLE,
        formData({ gate_name: '', gate_kind: 'x', client_event_id: EVENT }),
      ),
    ).toMatchObject({
      errors: { gate_name: 'gateNameRequired', gate_kind: 'gateKindInvalid' },
    });
  });

  it('answers a pairing code once, with its expiry', async () => {
    registry.createDevicePairing.mockResolvedValue({
      data: [
        {
          device_pairing_id: EVENT,
          pairing_code: 'a'.repeat(32),
          expires_at: '2026-10-10T12:10:00Z',
        },
      ],
      error: null,
    });
    const answer = await gates.createPairingAction(GATE);
    expect(answer).toMatchObject({
      status: 'success',
      notice: 'pairingCreated',
    });
    expect(JSON.parse((answer as { value: string }).value)).toEqual({
      code: 'a'.repeat(32),
      expiresAt: '2026-10-10T12:10:00Z',
    });
    registry.createDevicePairing.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    expect(await gates.createPairingAction(GATE)).toMatchObject({
      formError: 'denied',
    });
  });

  it('revokes a device and a guard invitation; deactivates a guard through the membership RPC', async () => {
    registry.revokeDevice.mockResolvedValue(ok);
    expect(await gates.revokeDeviceAction(GATE)).toMatchObject({
      notice: 'deviceRevoked',
    });
    revokeInvitation.mockResolvedValue(ok);
    expect(await guards.revokeGuardInvitationAction(EVENT)).toMatchObject({
      notice: 'invitationRevoked',
    });
    rpc.mockResolvedValue(ok);
    expect(await guards.deactivateGuardAction(MEMBERSHIP)).toMatchObject({
      notice: 'guardDeactivated',
    });
    expect(rpc).toHaveBeenCalledWith('revoke_membership', {
      target_membership_id: MEMBERSHIP,
    });
    registry.assignGuardGate.mockResolvedValue(ok);
    await guards.assignGuardGateAction(MEMBERSHIP, GATE, false);
    expect(registry.assignGuardGate.mock.calls[0]?.[1]).toMatchObject({
      assigned: false,
      target_gate_id: GATE,
      target_membership_id: MEMBERSHIP,
    });
  });

  it('invites a guard through the Edge Function with the guard role', async () => {
    sendInvitation.mockResolvedValue({ data: {}, error: null });
    const form = (overrides: Record<string, string> = {}) =>
      formData({
        invited_email: 'G@x.com',
        first_name: 'Gael',
        last_name: 'Guardián',
        client_event_id: EVENT,
        ...overrides,
      });
    expect(await guards.inviteGuardAction(IDLE, form())).toEqual({
      status: 'success',
      notice: 'guardInvited',
    });
    expect(sendInvitation.mock.calls[0]?.[1]).toMatchObject({
      target_role: 'guard',
      invited_email: 'g@x.com',
      target_tenant_id: TENANT,
    });
    expect(
      await guards.inviteGuardAction(IDLE, form({ first_name: '' })),
    ).toMatchObject({
      errors: { first_name: 'firstNameRequired' },
    });
    sendInvitation.mockResolvedValue({
      error: {
        context: new Response('{"code":"delivery_failed"}', { status: 502 }),
      },
    });
    expect(await guards.inviteGuardAction(IDLE, form())).toMatchObject({
      formError: 'deliveryFailed',
    });
  });
});

describe('device pairing on the tablet', () => {
  const pairForm = (code = 'ABCD-'.repeat(7) + 'ABCD') =>
    formData({ device_name: 'Tablet 1', pairing_code: code });

  it('keeps the credential in an httpOnly cookie and only says the device name', async () => {
    registry.redeemDevicePairing.mockResolvedValue({
      data: { status: 'paired', device_id: GATE, device_token: 'b'.repeat(64) },
      error: null,
    });
    const answer = await pairing.redeemPairingAction(
      IDLE,
      pairForm('A1B2-'.repeat(7) + 'A1B2'),
    );
    expect(answer).toEqual({
      status: 'success',
      notice: 'paired',
      value: 'Tablet 1',
    });
    expect(JSON.stringify(answer)).not.toContain('b'.repeat(64));
    expect(registry.redeemDevicePairing.mock.calls[0]?.[1]).toEqual({
      target_tenant_id: TENANT,
      pairing_code: 'a1b2'.repeat(8),
      device_name: 'Tablet 1',
    });
    const [name, value, options] = cookieSet.mock.calls[0] ?? [];
    expect(name).toBe('domus-device');
    expect(options).toMatchObject({
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    expect(JSON.parse(Buffer.from(value, 'base64url').toString())).toEqual({
      tenant_id: TENANT,
      device_id: GATE,
      device_token: 'b'.repeat(64),
    });
  });

  it('gives one answer for every unavailable code and sets no cookie', async () => {
    registry.redeemDevicePairing.mockResolvedValue({
      data: { status: 'unavailable' },
      error: null,
    });
    expect(
      await pairing.redeemPairingAction(IDLE, pairForm('0'.repeat(32))),
    ).toMatchObject({ formError: 'pairingUnavailable' });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it('refuses people who may not pair, and malformed codes, before calling the database', async () => {
    canPairDevices.mockResolvedValue(null);
    expect(await pairing.redeemPairingAction(IDLE, pairForm())).toMatchObject({
      formError: 'denied',
    });
    canPairDevices.mockResolvedValue(TENANT);
    expect(
      await pairing.redeemPairingAction(IDLE, pairForm('abc')),
    ).toMatchObject({ errors: { pairing_code: 'pairingCodeInvalid' } });
    expect(registry.redeemDevicePairing).not.toHaveBeenCalled();
  });
});

describe('bulk import', () => {
  const rows = [{ unit_code: 'A1', unit_status: 'vacant' }];

  it('stages the rows and answers with the rows that have errors only', async () => {
    registry.createRegistryImport.mockResolvedValue({
      data: UNIT,
      error: null,
    });
    registry.previewRegistryImport.mockResolvedValue({
      data: {
        rows: [
          { row_number: 1, data: { unit_code: 'A1' }, errors: [] },
          {
            row_number: 2,
            data: { unit_code: 'A2' },
            errors: ['unit_rows_conflict'],
          },
        ],
      },
      error: null,
    });
    const answer = await importing.stageImportAction(rows, EVENT);
    expect(answer).toEqual({
      ok: true,
      data: {
        importId: UNIT,
        rowCount: 2,
        errorCount: 1,
        errorRows: [
          { row_number: 2, unit_code: 'A2', errors: ['unit_rows_conflict'] },
        ],
      },
    });
    // What reaches the database is the schema's output (defaults applied), never the raw client value.
    expect(
      registry.createRegistryImport.mock.calls[0]?.[1].rows[0],
    ).toMatchObject({
      unit_code: 'A1',
      unit_coefficient: 1,
    });
  });

  it('refuses rows the contract does not accept and maps database errors', async () => {
    expect(await importing.stageImportAction([{ nope: 1 }], EVENT)).toEqual({
      ok: false,
      error: 'importInvalidRows',
    });
    expect(await importing.stageImportAction(rows, 'x')).toEqual({
      ok: false,
      error: 'unknown',
    });
    registry.createRegistryImport.mockResolvedValue({
      data: null,
      error: { code: '40P01' },
    });
    expect(await importing.stageImportAction(rows, EVENT)).toEqual({
      ok: false,
      error: 'busy',
    });
    getAdminScope.mockResolvedValue(null);
    expect(await importing.stageImportAction(rows, EVENT)).toEqual({
      ok: false,
      error: 'denied',
    });
  });

  function snapshotClient(counts: { units: number; newest: string }[]) {
    let phase = -1;
    fromTable.mockImplementation((table: string) => {
      if (table === 'unit') phase += 1;
      const state = counts[Math.min(phase, counts.length - 1)] ?? counts[0];
      const result = {
        count: table === 'unit' ? (state?.units ?? 0) : 0,
        data: [
          {
            unit_updated_at: state?.newest,
            unit_resident_updated_at: '',
            person_updated_at: '',
          },
        ],
      };
      const chain: Record<string, unknown> = {
        then: (r: (v: unknown) => unknown) => r(result),
      };
      for (const name of ['select', 'eq', 'order', 'limit'])
        chain[name] = () => chain;
      return chain;
    });
  }

  it('reports "unchanged" when nothing stored moved, and the created counts when it did', async () => {
    registry.confirmRegistryImport.mockResolvedValue({
      data: { status: 'confirmed', unit_count: 3, resident_count: 9 },
      error: null,
    });
    snapshotClient([
      { units: 3, newest: '2026-10-10T10:00:00Z' },
      { units: 3, newest: '2026-10-10T10:00:00Z' },
    ]);
    expect(await importing.confirmImportAction(UNIT, EVENT)).toMatchObject({
      ok: true,
      data: {
        status: 'confirmed',
        unitCount: 3,
        createdUnits: 0,
        unchanged: true,
      },
    });

    snapshotClient([
      { units: 1, newest: '2026-10-10T10:00:00Z' },
      { units: 3, newest: '2026-10-10T11:00:00Z' },
    ]);
    expect(await importing.confirmImportAction(UNIT, EVENT)).toMatchObject({
      ok: true,
      data: { createdUnits: 2, unchanged: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/registry/units');
  });

  it('passes through an invalid verdict and refuses bad ids', async () => {
    registry.confirmRegistryImport.mockResolvedValue({
      data: { status: 'invalid', error_count: 4 },
      error: null,
    });
    snapshotClient([{ units: 0, newest: '' }]);
    expect(await importing.confirmImportAction(UNIT, EVENT)).toMatchObject({
      ok: true,
      data: { status: 'invalid', errorCount: 4, unchanged: false },
    });
    expect(await importing.confirmImportAction('x', EVENT)).toEqual({
      ok: false,
      error: 'unknown',
    });
  });
});
