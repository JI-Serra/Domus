// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formData } from '@/test/server-mocks';

const getManagerScope = vi.fn();
const loadHouseholdSheet = vi.fn();
const saveResident = vi.fn();
const saveVehicle = vi.fn();
const savePet = vi.fn();
const sendResidentInvitation = vi.fn();
const revokeResidentInvitation = vi.fn();
const setHouseholdPermissions = vi.fn();
const decideUnitJoinRequest = vi.fn();
const endHouseholdMembership = vi.fn();
const rotateUnitJoinCode = vi.fn();
const revalidatePath = vi.fn();
const reportError = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock('@domus/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock('@/lib/household/scope', () => ({
  getManagerScope: () => getManagerScope(),
  loadHouseholdSheet: (...args: unknown[]) => loadHouseholdSheet(...args),
}));
vi.mock('@domus/supabase/registry', () => ({
  saveResident: (...args: unknown[]) => saveResident(...args),
  saveVehicle: (...args: unknown[]) => saveVehicle(...args),
  savePet: (...args: unknown[]) => savePet(...args),
  sendResidentInvitation: (...args: unknown[]) =>
    sendResidentInvitation(...args),
  revokeResidentInvitation: (...args: unknown[]) =>
    revokeResidentInvitation(...args),
  setHouseholdPermissions: (...args: unknown[]) =>
    setHouseholdPermissions(...args),
  decideUnitJoinRequest: (...args: unknown[]) => decideUnitJoinRequest(...args),
  endHouseholdMembership: (...args: unknown[]) =>
    endHouseholdMembership(...args),
  rotateUnitJoinCode: (...args: unknown[]) => rotateUnitJoinCode(...args),
}));

const actions = await import('./actions');

const IDLE = { status: 'idle' } as const;
const TENANT = '10000000-0000-4000-8000-000000000001';
const UNIT = 'a1000000-0000-4000-8000-000000000001';
const PERSON = '30000000-0000-4000-8000-000000000001';
const HOLDER_PERSON = '30000000-0000-4000-8000-000000000009';
const MEMBERSHIP = '40000000-0000-4000-8000-000000000001';
const RESIDENT = '50000000-0000-4000-8000-000000000001';
const EVENT = '80000000-0000-4000-8000-000000000001';
const EVENT_2 = '80000000-0000-4000-8000-000000000002';
const INVITATION = '60000000-0000-4000-8000-000000000001';
const client = { id: 'client' };

const resident = (
  personId: string,
  overrides: Record<string, unknown> = {},
) => ({
  unit_resident_id: RESIDENT,
  person_id: personId,
  unit_resident_is_holder: false,
  unit_resident_is_minor: false,
  unit_resident_relationship: 'family',
  unit_resident_valid_from_at: '2026-01-01T00:00:00Z',
  unit_resident_valid_to_at: null,
  person_first_name: 'Diego',
  person_last_name: 'Ceibos',
  person_email: 'diego@domus.local',
  person_phone: '3815550000',
  person_birth_date: null,
  person_document_type: 'dni',
  person_document_number: '12345678',
  ...overrides,
});

const baseSheet = (overrides: Record<string, unknown> = {}) => ({
  unit: { tenant_id: TENANT, unit_id: UNIT, unit_code: 'Mz 1 Lote 1' },
  residents: [
    resident(HOLDER_PERSON, {
      unit_resident_id: '50000000-0000-4000-8000-000000000009',
      unit_resident_is_holder: true,
    }),
    resident(PERSON),
  ],
  vehicles: [
    {
      vehicle_id: '70000000-0000-4000-8000-000000000001',
      vehicle_plate_code: 'AB123CD',
      vehicle_make_name: 'Fiat',
      vehicle_model_name: null,
      vehicle_color_name: null,
    },
  ],
  pets: [
    {
      pet_id: '71000000-0000-4000-8000-000000000001',
      pet_name: 'Luna',
      pet_species_name: 'Perro',
      pet_breed_name: null,
      pet_photo_path: `${TENANT}/${UNIT}/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.png`,
    },
  ],
  memberships: [
    {
      membership_id: 'm-holder',
      person_id: HOLDER_PERSON,
      membership_role: 'unit_holder',
      membership_status: 'active',
      membership_valid_from: '2026-01-01T00:00:00Z',
      membership_valid_to: null,
    },
  ],
  pending_invitations: [],
  pending_join_requests: [],
  member_permissions: {},
  permissions: [],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  getManagerScope.mockResolvedValue({
    scope: {
      client,
      tenantId: TENANT,
      unitId: UNIT,
      membershipId: 'm-holder',
      isHolder: true,
    },
    problem: null,
  });
  loadHouseholdSheet.mockResolvedValue(baseSheet());
  saveResident.mockResolvedValue({ data: RESIDENT, error: null });
  saveVehicle.mockResolvedValue({ data: 'v', error: null });
  savePet.mockResolvedValue({ data: 'p', error: null });
  sendResidentInvitation.mockResolvedValue({
    data: { invitation_id: INVITATION },
    error: null,
  });
  revokeResidentInvitation.mockResolvedValue({ error: null });
  setHouseholdPermissions.mockResolvedValue({ error: null });
  decideUnitJoinRequest.mockResolvedValue({ data: null, error: null });
  endHouseholdMembership.mockResolvedValue({ error: null });
  rotateUnitJoinCode.mockResolvedValue({ data: 'ABCD-EFGH-JKMN', error: null });
});

const refused = (problem: 'denied' | 'readOnly') =>
  getManagerScope.mockResolvedValue({ scope: null, problem });

const memberForm = (overrides: Record<string, string> = {}) =>
  formData({
    person_first_name: 'Diego',
    person_last_name: 'Ceibos',
    person_email: 'diego@domus.local',
    person_phone: '',
    person_birth_date: '',
    unit_resident_relationship: 'family',
    client_event_id: EVENT,
    invitation_event_id: EVENT_2,
    ...overrides,
  });

describe('every household write', () => {
  it('is refused for anybody who is not a holder, and for a read-only barrio', async () => {
    refused('denied');
    expect(await actions.addMemberAction(IDLE, memberForm())).toMatchObject({
      status: 'error',
      formError: 'denied',
    });
    expect(await actions.endMembershipAction(PERSON)).toMatchObject({
      formError: 'denied',
    });
    expect(await actions.setPermissionsAction(MEMBERSHIP, [])).toMatchObject({
      formError: 'denied',
    });
    expect(await actions.rotateJoinCodeAction()).toMatchObject({
      formError: 'denied',
    });
    refused('readOnly');
    expect(await actions.removeVehicleAction(UNIT)).toMatchObject({
      formError: 'readOnly',
    });
    expect(saveResident).not.toHaveBeenCalled();
    expect(setHouseholdPermissions).not.toHaveBeenCalled();
    expect(rotateUnitJoinCode).not.toHaveBeenCalled();
  });
});

describe('addMemberAction', () => {
  it('registers the resident in the holder unit, then sends the invitation with its own key', async () => {
    const state = await actions.addMemberAction(IDLE, memberForm());
    expect(state).toEqual({ status: 'success', notice: 'invited' });
    expect(saveResident).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      person_data: {
        person_first_name: 'Diego',
        person_last_name: 'Ceibos',
        person_email: 'diego@domus.local',
      },
      resident_data: {
        unit_resident_relationship: 'family',
        unit_resident_is_holder: false,
        unit_resident_is_minor: false,
      },
      client_event_id: EVENT,
    });
    expect(sendResidentInvitation).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      invited_email: 'diego@domus.local',
      target_role: 'household_member',
      client_event_id: EVENT_2,
      target_person_id: PERSON,
    });
    expect(revalidatePath).toHaveBeenCalledWith('/home');
  });

  it('never takes the tenant or the unit from the form', async () => {
    await actions.addMemberAction(
      IDLE,
      memberForm({
        target_tenant_id: 'evil',
        target_unit_id: 'evil',
        unit_resident_is_holder: 'true',
      }),
    );
    const args = saveResident.mock.calls[0]?.[1];
    expect(args).toMatchObject({
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
    });
    expect(args.resident_data.unit_resident_is_holder).toBe(false);
  });

  it('registers a minor without account and sends no invitation', async () => {
    const state = await actions.addMemberAction(
      IDLE,
      memberForm({ person_email: '', is_minor: 'on' }),
    );
    expect(state).toEqual({ status: 'success', notice: 'minorAdded' });
    expect(saveResident.mock.calls[0]?.[1].resident_data).toMatchObject({
      unit_resident_is_minor: true,
    });
    expect(sendResidentInvitation).not.toHaveBeenCalled();
  });

  it('keeps what was typed and the field errors when the form is invalid', async () => {
    const state = await actions.addMemberAction(
      IDLE,
      memberForm({ person_first_name: '', person_email: 'nope' }),
    );
    expect(state).toMatchObject({
      status: 'error',
      errors: { person_first_name: 'firstNameRequired' },
      values: { person_email: 'nope' },
    });
    expect(saveResident).not.toHaveBeenCalled();
  });

  it('asks for the email of an adult', async () => {
    expect(
      await actions.addMemberAction(IDLE, memberForm({ person_email: '' })),
    ).toMatchObject({ errors: { person_email: 'emailRequired' } });
  });

  it('says so when the data was saved but the email could not be delivered', async () => {
    sendResidentInvitation.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ code: 'delivery_failed' }), {
          status: 502,
        }),
      },
    });
    expect(await actions.addMemberAction(IDLE, memberForm())).toMatchObject({
      status: 'error',
      formError: 'deliveryFailed',
      values: { client_event_id: EVENT, invitation_event_id: EVENT_2 },
    });
  });

  it.each([
    ['42501', 'denied'],
    ['22023', 'invalid'],
    ['23514', 'holderRequired'],
    ['23505', 'duplicate'],
  ])('maps database error %s to %s', async (code, key) => {
    saveResident.mockResolvedValue({ data: null, error: { code } });
    expect(await actions.addMemberAction(IDLE, memberForm())).toMatchObject({
      formError: key,
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports an unexpected error with its code only', async () => {
    saveResident.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    expect(await actions.addMemberAction(IDLE, memberForm())).toMatchObject({
      formError: 'unknown',
    });
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(String(reportError.mock.calls[0]?.[0])).toContain('XX000');
    expect(JSON.stringify(reportError.mock.calls)).not.toContain('diego@');
  });
});

describe('inviteResidentAction', () => {
  const inviteForm = (email = 'nuevo@domus.local') =>
    formData({
      person_email: email,
      client_event_id: EVENT,
      invitation_event_id: EVENT_2,
    });

  it('saves a changed email on the person first and keeps the rest of the data', async () => {
    const state = await actions.inviteResidentAction(
      PERSON,
      IDLE,
      inviteForm(),
    );
    expect(state).toEqual({ status: 'success', notice: 'invited' });
    const saved = saveResident.mock.calls[0]?.[1];
    expect(saved.person_data).toMatchObject({
      person_id: PERSON,
      person_email: 'nuevo@domus.local',
      person_document_number: '12345678',
      person_phone: '3815550000',
    });
    expect(saved.resident_data).toMatchObject({
      unit_resident_valid_from_at: '2026-01-01T00:00:00Z',
      unit_resident_is_holder: false,
    });
    expect(sendResidentInvitation).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        invited_email: 'nuevo@domus.local',
        target_person_id: PERSON,
      }),
    );
  });

  it('skips the person update when the email did not change', async () => {
    await actions.inviteResidentAction(
      PERSON,
      IDLE,
      inviteForm('diego@domus.local'),
    );
    expect(saveResident).not.toHaveBeenCalled();
    expect(sendResidentInvitation).toHaveBeenCalled();
  });

  it('refuses holders, minors, members with an account and strangers', async () => {
    expect(
      await actions.inviteResidentAction(HOLDER_PERSON, IDLE, inviteForm()),
    ).toMatchObject({ formError: 'denied' });
    expect(
      await actions.inviteResidentAction(
        '30000000-0000-4000-8000-0000000000ff',
        IDLE,
        inviteForm(),
      ),
    ).toMatchObject({ formError: 'denied' });
    loadHouseholdSheet.mockResolvedValue(
      baseSheet({
        residents: [resident(PERSON, { unit_resident_is_minor: true })],
      }),
    );
    expect(
      await actions.inviteResidentAction(PERSON, IDLE, inviteForm()),
    ).toMatchObject({ formError: 'denied' });
    expect(sendResidentInvitation).not.toHaveBeenCalled();
  });
});

describe('updateMemberAction', () => {
  const detailForm = (overrides: Record<string, string> = {}) =>
    formData({
      person_first_name: 'Diego',
      person_last_name: 'Nuevo',
      person_email: 'otro@domus.local',
      person_phone: '',
      person_birth_date: '2000-05-01',
      unit_resident_relationship: 'tenant',
      ...overrides,
    });

  it('replaces the person and the relationship, keeping document and residence window', async () => {
    const state = await actions.updateMemberAction(PERSON, IDLE, detailForm());
    expect(state).toEqual({ status: 'success', notice: 'saved' });
    const saved = saveResident.mock.calls[0]?.[1];
    expect(saved.person_data).toMatchObject({
      person_id: PERSON,
      person_last_name: 'Nuevo',
      person_email: 'otro@domus.local',
      person_birth_date: '2000-05-01',
      person_document_number: '12345678',
    });
    expect(saved.person_data.person_phone).toBeUndefined();
    expect(saved.resident_data).toMatchObject({
      unit_resident_relationship: 'tenant',
      unit_resident_valid_from_at: '2026-01-01T00:00:00Z',
    });
  });

  it('does not edit people with an account or a live invitation (only a registry admin can)', async () => {
    loadHouseholdSheet.mockResolvedValue(
      baseSheet({
        memberships: [
          {
            membership_id: MEMBERSHIP,
            person_id: PERSON,
            membership_role: 'household_member',
            membership_status: 'active',
            membership_valid_from: '2026-01-01T00:00:00Z',
            membership_valid_to: null,
          },
        ],
      }),
    );
    expect(
      await actions.updateMemberAction(PERSON, IDLE, detailForm()),
    ).toMatchObject({ formError: 'denied' });
    expect(saveResident).not.toHaveBeenCalled();
  });

  it('does not touch another holder', async () => {
    expect(
      await actions.updateMemberAction(HOLDER_PERSON, IDLE, detailForm()),
    ).toMatchObject({ formError: 'denied' });
    expect(saveResident).not.toHaveBeenCalled();
  });
});

describe('endMembershipAction', () => {
  it('ends the residence of a person without account, now', async () => {
    const state = await actions.endMembershipAction(PERSON);
    expect(state).toEqual({ status: 'success', notice: 'ended' });
    const ended =
      saveResident.mock.calls[0]?.[1].resident_data.unit_resident_valid_to_at;
    expect(Date.parse(ended)).toBeLessThanOrEqual(Date.now());
    expect(Date.parse(ended)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('does not end a person with an account or a live invitation', async () => {
    loadHouseholdSheet.mockResolvedValue(
      baseSheet({
        pending_invitations: [
          {
            invitation_id: INVITATION,
            client_event_id: EVENT,
            person_id: PERSON,
            invitation_email: 'diego@domus.local',
            invitation_status: 'pending',
            invitation_expires_at: '2999-01-01T00:00:00Z',
            invitation_delivered_at: null,
          },
        ],
      }),
    );
    expect(await actions.endMembershipAction(PERSON)).toMatchObject({
      formError: 'denied',
    });
    expect(saveResident).not.toHaveBeenCalled();
  });

  it('never ends a holder', async () => {
    expect(await actions.endMembershipAction(HOLDER_PERSON)).toMatchObject({
      formError: 'denied',
    });
    expect(saveResident).not.toHaveBeenCalled();
  });
});

describe('removeAccountMemberAction (T20)', () => {
  const accountSheet = () =>
    baseSheet({
      memberships: [
        {
          membership_id: 'm-holder',
          person_id: HOLDER_PERSON,
          membership_role: 'unit_holder',
          membership_status: 'active',
          membership_valid_from: '2026-01-01T00:00:00Z',
          membership_valid_to: null,
        },
        {
          membership_id: MEMBERSHIP,
          person_id: PERSON,
          membership_role: 'household_member',
          membership_status: 'active',
          membership_valid_from: '2026-01-01T00:00:00Z',
          membership_valid_to: null,
        },
      ],
    });

  it('ends the membership with a fresh event key and refreshes the page', async () => {
    loadHouseholdSheet.mockResolvedValue(accountSheet());
    expect(await actions.removeAccountMemberAction(MEMBERSHIP)).toEqual({
      status: 'success',
      notice: 'removedMember',
    });
    const [, sent] = endHouseholdMembership.mock.calls[0] ?? [];
    expect(sent.target_membership_id).toBe(MEMBERSHIP);
    expect(sent.client_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(revalidatePath).toHaveBeenCalledWith('/home');
    await actions.removeAccountMemberAction(MEMBERSHIP);
    expect(endHouseholdMembership.mock.calls[1]?.[1].client_event_id).not.toBe(
      sent.client_event_id,
    );
    expect(saveResident).not.toHaveBeenCalled();
  });

  it('is never sent for a holder, an unknown id or somebody without an account', async () => {
    loadHouseholdSheet.mockResolvedValue(accountSheet());
    expect(await actions.removeAccountMemberAction('m-holder')).toMatchObject({
      formError: 'denied',
    });
    expect(
      await actions.removeAccountMemberAction(
        '40000000-0000-4000-8000-0000000000ff',
      ),
    ).toMatchObject({ formError: 'denied' });
    expect(await actions.removeAccountMemberAction('nope')).toMatchObject({
      formError: 'denied',
    });
    loadHouseholdSheet.mockResolvedValue(baseSheet());
    expect(await actions.removeAccountMemberAction(MEMBERSHIP)).toMatchObject({
      formError: 'denied',
    });
    expect(endHouseholdMembership).not.toHaveBeenCalled();
  });

  it('shows a database refusal and is refused for a read-only barrio', async () => {
    loadHouseholdSheet.mockResolvedValue(accountSheet());
    endHouseholdMembership.mockResolvedValue({ error: { code: '42501' } });
    expect(await actions.removeAccountMemberAction(MEMBERSHIP)).toMatchObject({
      status: 'error',
      formError: 'denied',
    });
    refused('readOnly');
    expect(await actions.removeAccountMemberAction(MEMBERSHIP)).toMatchObject({
      formError: 'readOnly',
    });
  });
});

describe('invitations', () => {
  const delivered = (overrides: Record<string, unknown> = {}) => ({
    invitation_id: INVITATION,
    client_event_id: EVENT,
    person_id: PERSON,
    invitation_email: 'diego@domus.local',
    invitation_status: 'pending',
    invitation_expires_at: '2999-01-01T00:00:00Z',
    invitation_delivered_at: null,
    ...overrides,
  });

  it('resends an undelivered one with its own key and email', async () => {
    loadHouseholdSheet.mockResolvedValue(
      baseSheet({ pending_invitations: [delivered()] }),
    );
    expect(await actions.resendInvitationAction(INVITATION)).toEqual({
      status: 'success',
      notice: 'resent',
    });
    expect(sendResidentInvitation).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      invited_email: 'diego@domus.local',
      target_role: 'household_member',
      client_event_id: EVENT,
      target_person_id: PERSON,
    });
  });

  it('does not resend one that was delivered or does not exist', async () => {
    loadHouseholdSheet.mockResolvedValue(
      baseSheet({
        pending_invitations: [
          delivered({ invitation_delivered_at: '2026-10-10T10:00:00Z' }),
        ],
      }),
    );
    expect(await actions.resendInvitationAction(INVITATION)).toMatchObject({
      formError: 'denied',
    });
    expect(sendResidentInvitation).not.toHaveBeenCalled();
  });

  it('revokes through the database', async () => {
    expect(await actions.revokeInvitationAction(INVITATION)).toEqual({
      status: 'success',
      notice: 'revoked',
    });
    expect(revokeResidentInvitation).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      target_invitation_id: INVITATION,
    });
    expect(await actions.revokeInvitationAction('nope')).toMatchObject({
      formError: 'denied',
    });
  });
});

describe('setPermissionsAction (D23)', () => {
  it('sends the complete set once, without duplicates', async () => {
    const state = await actions.setPermissionsAction(MEMBERSHIP, [
      'book_amenities',
      'book_amenities',
      'manage_access_authorizations',
    ]);
    expect(state).toEqual({ status: 'success', notice: 'permissionsSaved' });
    const sent = setHouseholdPermissions.mock.calls[0]?.[1];
    expect(sent).toMatchObject({
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      target_membership_id: MEMBERSHIP,
      permissions: ['book_amenities', 'manage_access_authorizations'],
    });
    expect(sent.client_event_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('accepts an empty set and rejects unknown permissions or ids', async () => {
    expect(await actions.setPermissionsAction(MEMBERSHIP, [])).toMatchObject({
      status: 'success',
    });
    expect(
      await actions.setPermissionsAction(MEMBERSHIP, ['admin']),
    ).toMatchObject({ formError: 'denied' });
    expect(await actions.setPermissionsAction('x', [])).toMatchObject({
      formError: 'denied',
    });
    expect(setHouseholdPermissions).toHaveBeenCalledTimes(1);
  });

  it('shows the database refusal (minors, self, not a holder) as denied', async () => {
    setHouseholdPermissions.mockResolvedValue({ error: { code: '42501' } });
    expect(await actions.setPermissionsAction(MEMBERSHIP, [])).toMatchObject({
      status: 'error',
      formError: 'denied',
    });
  });
});

describe('vehicles', () => {
  const vehicleForm = (overrides: Record<string, string> = {}) =>
    formData({
      vehicle_plate_code: 'ab 123 cd',
      vehicle_make_name: 'Fiat',
      vehicle_model_name: '',
      vehicle_color_name: '',
      client_event_id: EVENT,
      ...overrides,
    });

  it('saves a normalized plate in the holder unit', async () => {
    expect(await actions.saveVehicleAction(null, IDLE, vehicleForm())).toEqual({
      status: 'success',
      notice: 'saved',
    });
    expect(saveVehicle).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      vehicle_data: {
        vehicle_plate_code: 'AB123CD',
        vehicle_make_name: 'Fiat',
      },
      client_event_id: EVENT,
    });
  });

  it('edits an existing vehicle by id', async () => {
    const id = '70000000-0000-4000-8000-000000000001';
    await actions.saveVehicleAction(id, IDLE, vehicleForm());
    expect(saveVehicle.mock.calls[0]?.[1].vehicle_data.vehicle_id).toBe(id);
  });

  it('flags an invalid or taken plate on the field', async () => {
    expect(
      await actions.saveVehicleAction(
        null,
        IDLE,
        vehicleForm({ vehicle_plate_code: '!' }),
      ),
    ).toMatchObject({ errors: { vehicle_plate_code: 'plateInvalid' } });
    saveVehicle.mockResolvedValue({ data: null, error: { code: '23505' } });
    expect(
      await actions.saveVehicleAction(null, IDLE, vehicleForm()),
    ).toMatchObject({ errors: { vehicle_plate_code: 'plateTaken' } });
  });

  it('removes by archiving with the data it already has', async () => {
    const id = '70000000-0000-4000-8000-000000000001';
    expect(await actions.removeVehicleAction(id)).toEqual({
      status: 'success',
      notice: 'removed',
    });
    const data = saveVehicle.mock.calls[0]?.[1].vehicle_data;
    expect(data).toMatchObject({
      vehicle_id: id,
      vehicle_plate_code: 'AB123CD',
    });
    expect(typeof data.vehicle_archived_at).toBe('string');
    expect(
      await actions.removeVehicleAction('70000000-0000-4000-8000-0000000000ff'),
    ).toMatchObject({ formError: 'denied' });
  });
});

describe('pets', () => {
  const PHOTO = `${TENANT}/${UNIT}/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.jpg`;
  const petForm = (overrides: Record<string, string> = {}) =>
    formData({
      pet_name: 'Luna',
      pet_species_name: 'Perro',
      pet_breed_name: '',
      pet_photo_path: '',
      remove_photo: '',
      client_event_id: EVENT,
      ...overrides,
    });
  const PET = '71000000-0000-4000-8000-000000000001';

  it('stores a photo path inside the unit folder', async () => {
    expect(
      await actions.savePetAction(
        null,
        IDLE,
        petForm({ pet_photo_path: PHOTO }),
      ),
    ).toEqual({ status: 'success', notice: 'saved' });
    expect(savePet.mock.calls[0]?.[1].pet_data).toEqual({
      pet_name: 'Luna',
      pet_species_name: 'Perro',
      pet_photo_path: PHOTO,
    });
  });

  it('refuses a path in another unit or tenant folder', async () => {
    for (const path of [
      `${TENANT}/other/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.jpg`,
      `other/${UNIT}/0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f.jpg`,
      `${TENANT}/${UNIT}/../x.jpg`,
    ])
      expect(
        await actions.savePetAction(
          null,
          IDLE,
          petForm({ pet_photo_path: path }),
        ),
      ).toMatchObject({ errors: { photo: 'photoUploadFailed' } });
    expect(savePet).not.toHaveBeenCalled();
  });

  it('keeps the stored photo on edit unless it is removed or replaced', async () => {
    await actions.savePetAction(PET, IDLE, petForm());
    expect(savePet.mock.calls[0]?.[1].pet_data.pet_photo_path).toContain(
      `${TENANT}/${UNIT}/`,
    );
    await actions.savePetAction(PET, IDLE, petForm({ remove_photo: '1' }));
    expect(savePet.mock.calls[1]?.[1].pet_data.pet_photo_path).toBeUndefined();
  });

  it('asks for a name and a species', async () => {
    expect(
      await actions.savePetAction(
        null,
        IDLE,
        petForm({ pet_name: '', pet_species_name: '' }),
      ),
    ).toMatchObject({
      errors: {
        pet_name: 'petNameRequired',
        pet_species_name: 'petSpeciesRequired',
      },
    });
  });

  it('removes by archiving', async () => {
    expect(await actions.removePetAction(PET)).toEqual({
      status: 'success',
      notice: 'removed',
    });
    expect(savePet.mock.calls[0]?.[1].pet_data).toMatchObject({
      pet_id: PET,
      pet_name: 'Luna',
    });
    expect(typeof savePet.mock.calls[0]?.[1].pet_data.pet_archived_at).toBe(
      'string',
    );
  });
});

describe('decideJoinRequestAction (D22)', () => {
  const REQUEST = '90000000-0000-4000-8000-000000000001';
  const sheetWithRequest = () =>
    baseSheet({
      pending_join_requests: [
        {
          unit_join_request_id: REQUEST,
          unit_join_request_first_name: 'Ana',
          unit_join_request_last_name: 'Gómez',
          unit_join_request_email: 'ana@domus.local',
          unit_join_request_created_at: '2026-10-09T10:00:00Z',
        },
      ],
    });

  it('approves as household member and delivers the invitation the decision issued', async () => {
    loadHouseholdSheet.mockResolvedValue(sheetWithRequest());
    decideUnitJoinRequest.mockResolvedValue({
      data: {
        status: 'approved',
        invitation_id: INVITATION,
        invitation_client_event_id: EVENT_2,
        person_id: PERSON,
      },
      error: null,
    });
    expect(await actions.decideJoinRequestAction(REQUEST, true, EVENT)).toEqual(
      { status: 'success', notice: 'approved' },
    );
    expect(decideUnitJoinRequest).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      target_request_id: REQUEST,
      approve: true,
      client_event_id: EVENT,
      target_role: 'household_member',
    });
    expect(sendResidentInvitation).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
      invited_email: 'ana@domus.local',
      target_role: 'household_member',
      client_event_id: EVENT_2,
      target_person_id: PERSON,
    });
  });

  it('rejects without inviting anybody', async () => {
    loadHouseholdSheet.mockResolvedValue(sheetWithRequest());
    decideUnitJoinRequest.mockResolvedValue({
      data: { status: 'rejected' },
      error: null,
    });
    expect(
      await actions.decideJoinRequestAction(REQUEST, false, EVENT),
    ).toEqual({ status: 'success', notice: 'rejected' });
    expect(sendResidentInvitation).not.toHaveBeenCalled();
  });

  it('only decides requests of this unit that are still pending', async () => {
    expect(
      await actions.decideJoinRequestAction(REQUEST, true, EVENT),
    ).toMatchObject({ formError: 'denied' });
    expect(decideUnitJoinRequest).not.toHaveBeenCalled();
  });

  it('reports a failed delivery after approving (the invitation can be sent again from the member)', async () => {
    loadHouseholdSheet.mockResolvedValue(sheetWithRequest());
    decideUnitJoinRequest.mockResolvedValue({
      data: {
        status: 'approved',
        invitation_client_event_id: EVENT_2,
        person_id: PERSON,
      },
      error: null,
    });
    sendResidentInvitation.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ code: 'delivery_failed' }), {
          status: 502,
        }),
      },
    });
    expect(
      await actions.decideJoinRequestAction(REQUEST, true, EVENT),
    ).toMatchObject({ status: 'error', formError: 'deliveryFailed' });
  });
});

describe('rotateJoinCodeAction (D22)', () => {
  it('returns the new code once, in the answer only', async () => {
    expect(await actions.rotateJoinCodeAction()).toEqual({
      status: 'success',
      notice: 'rotated',
      value: 'ABCD-EFGH-JKMN',
    });
    expect(rotateUnitJoinCode).toHaveBeenCalledWith(client, {
      target_tenant_id: TENANT,
      target_unit_id: UNIT,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('maps a database refusal', async () => {
    rotateUnitJoinCode.mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    expect(await actions.rotateJoinCodeAction()).toMatchObject({
      formError: 'denied',
    });
  });
});
