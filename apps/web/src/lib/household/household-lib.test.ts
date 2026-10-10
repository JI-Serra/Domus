import { describe, expect, it } from 'vitest';
import { invitationLandingPath } from '@/lib/invitations/landing';
import { buildHouseholdView } from './view';
import type { HouseholdSheet } from './view';

const NOW = new Date('2026-10-10T12:00:00Z');
const TENANT = '10000000-0000-4000-8000-000000000001';
const UNIT = 'a1000000-0000-4000-8000-000000000001';

const HOLDER_PERSON = 'p-holder';
const MEMBER_PERSON = 'p-member';
const INVITED_PERSON = 'p-invited';
const MINOR_PERSON = 'p-minor';
const ENDED_PERSON = 'p-ended';

const resident = (
  personId: string,
  first: string,
  overrides: Record<string, unknown> = {},
) => ({
  unit_resident_id: `r-${personId}`,
  tenant_id: TENANT,
  unit_id: UNIT,
  person_id: personId,
  unit_resident_is_holder: false,
  unit_resident_is_minor: false,
  unit_resident_relationship: 'family',
  unit_resident_valid_from_at: '2026-01-01T00:00:00Z',
  unit_resident_valid_to_at: null,
  unit_resident_created_at: '2026-01-01T00:00:00Z',
  unit_resident_updated_at: '2026-01-01T00:00:00Z',
  person_first_name: first,
  person_last_name: 'Ceibos',
  person_email: `${first.toLowerCase()}@domus.local`,
  person_phone: null,
  person_birth_date: null,
  ...overrides,
});

const sheet = (overrides: Record<string, unknown> = {}): HouseholdSheet =>
  ({
    unit: { tenant_id: TENANT, unit_id: UNIT, unit_code: 'Mz 1 Lote 1' },
    residents: [
      resident(HOLDER_PERSON, 'Carla', {
        unit_resident_is_holder: true,
        unit_resident_relationship: 'owner',
      }),
      resident(MEMBER_PERSON, 'Diego'),
      resident(INVITED_PERSON, 'Ines'),
      resident(MINOR_PERSON, 'Mateo', { unit_resident_is_minor: true }),
      resident(ENDED_PERSON, 'Pablo', {
        unit_resident_valid_to_at: '2026-06-01T00:00:00Z',
      }),
    ],
    vehicles: [
      {
        vehicle_id: 'v1',
        vehicle_plate_code: 'AB123CD',
        vehicle_make_name: 'Fiat',
        vehicle_model_name: null,
        vehicle_color_name: 'Gris',
      },
    ],
    pets: [
      {
        pet_id: 'pet1',
        pet_name: 'Luna',
        pet_species_name: 'Perro',
        pet_breed_name: null,
        pet_photo_path: `${TENANT}/${UNIT}/x.png`,
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
      {
        membership_id: 'm-member',
        person_id: MEMBER_PERSON,
        membership_role: 'household_member',
        membership_status: 'active',
        membership_valid_from: '2026-01-01T00:00:00Z',
        membership_valid_to: null,
      },
    ],
    pending_invitations: [
      {
        invitation_id: 'i1',
        client_event_id: 'e1',
        person_id: INVITED_PERSON,
        invitation_email: 'ines@domus.local',
        invitation_status: 'pending',
        invitation_expires_at: '2026-10-15T00:00:00Z',
        invitation_delivered_at: null,
      },
    ],
    pending_join_requests: [
      {
        unit_join_request_id: 'q1',
        unit_join_request_first_name: 'Ana',
        unit_join_request_last_name: 'Gómez',
        unit_join_request_email: 'ana@domus.local',
        unit_join_request_created_at: '2026-10-09T10:00:00Z',
      },
    ],
    member_permissions: { 'm-member': ['book_amenities'] },
    permissions: [
      'view_unit_finance',
      'book_amenities',
      'manage_access_authorizations',
    ],
    ...overrides,
  }) as unknown as HouseholdSheet;

describe('buildHouseholdView (holder)', () => {
  const view = buildHouseholdView(
    sheet(),
    { membershipId: 'm-holder', isHolder: true },
    NOW,
  );
  const byName = (name: string) =>
    view.members.find((member) => member.firstName === name);

  it('lists current residents only, with their standing', () => {
    expect(view.members.map((member) => member.firstName)).toEqual([
      'Carla',
      'Diego',
      'Ines',
      'Mateo',
    ]);
    expect(byName('Carla')).toMatchObject({ standing: 'holder', isSelf: true });
    expect(byName('Diego')).toMatchObject({
      standing: 'member',
      isSelf: false,
      membershipId: 'm-member',
      permissions: ['book_amenities'],
    });
    expect(byName('Ines')).toMatchObject({
      standing: 'invited',
      invitation: { invitationId: 'i1', delivered: false, eventId: 'e1' },
    });
    expect(byName('Mateo')?.standing).toBe('minor');
  });

  it('gives a holder the full details of everybody', () => {
    expect(byName('Diego')).toMatchObject({
      detailed: true,
      email: 'diego@domus.local',
    });
  });

  it('carries the vehicles, pets, requests and the unit', () => {
    expect(view).toMatchObject({
      tenantId: TENANT,
      unitId: UNIT,
      unitCode: 'Mz 1 Lote 1',
      vehicles: [{ plate: 'AB123CD', make: 'Fiat', color: 'Gris' }],
      pets: [{ name: 'Luna', photoPath: `${TENANT}/${UNIT}/x.png` }],
      requests: [
        { requestId: 'q1', firstName: 'Ana', email: 'ana@domus.local' },
      ],
    });
  });
});

describe('buildHouseholdView (household member)', () => {
  // A member's sheet: names only for the others, the full profile for themself, no onboarding arrays.
  // JSON has no undefined: the keys are simply absent for people the viewer may only name.
  const namesOnly = (first: string, personId: string) =>
    Object.fromEntries(
      Object.entries(
        resident(personId, first, { unit_resident_is_holder: true }),
      ).filter(
        ([key]) =>
          !['person_email', 'person_phone', 'person_birth_date'].includes(key),
      ),
    );
  const memberSheet = sheet({
    residents: [
      namesOnly('Carla', HOLDER_PERSON),
      resident(MEMBER_PERSON, 'Diego'),
    ],
    memberships: [],
    pending_invitations: [],
    pending_join_requests: [],
    member_permissions: {},
    permissions: ['manage_access_authorizations'],
  });
  const view = buildHouseholdView(
    memberSheet,
    { membershipId: 'm-member', isHolder: false },
    NOW,
  );

  it('recognises the own resident row and hides the others', () => {
    const own = view.members.find((member) => member.firstName === 'Diego');
    const other = view.members.find((member) => member.firstName === 'Carla');
    expect(own).toMatchObject({ isSelf: true, detailed: true });
    expect(other).toMatchObject({
      isSelf: false,
      detailed: false,
      email: null,
    });
  });

  it('exposes only the permissions the database granted', () => {
    expect(view.permissions).toEqual(['manage_access_authorizations']);
    expect(view.requests).toEqual([]);
  });
});

describe('invitationLandingPath', () => {
  it('sends residents to Mi hogar and everybody else to the barrio home', () => {
    expect(invitationLandingPath('unit_holder')).toBe('/home');
    expect(invitationLandingPath('household_member')).toBe('/home');
    expect(invitationLandingPath('tenant_admin')).toBe('/');
    expect(invitationLandingPath('guard')).toBe('/');
    expect(invitationLandingPath('//evil.example')).toBe('/');
    expect(invitationLandingPath(undefined)).toBe('/');
  });
});
