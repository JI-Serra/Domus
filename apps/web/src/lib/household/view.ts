import { isResidentCurrent, residentStanding } from '@domus/domain/household';
import type {
  HouseholdPermission,
  ResidentStanding,
} from '@domus/domain/household';
import type { UnitSheet } from '@domus/supabase/registry';

/**
 * The unit sheet plus what T18 adds for unit managers: the delegated permissions of every member
 * (`reports/M02-db.md`, coordinator contract). Empty for everybody who cannot manage the household.
 */
export type HouseholdSheet = UnitSheet & {
  member_permissions?: Record<string, HouseholdPermission[]>;
};

type Relationship =
  UnitSheet['residents'][number]['unit_resident_relationship'];

export interface InvitationView {
  invitationId: string;
  eventId: string;
  email: string;
  expiresAt: string;
  /** Delivered invitations can only be revoked; an undelivered one can be sent again. */
  delivered: boolean;
}

/** One current resident of the unit, with what the viewer may know and do about them. */
export interface MemberView {
  residentId: string;
  personId: string;
  firstName: string;
  lastName: string;
  /** Contact and identity data only reach the holders and the person themself. */
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  relationship: Relationship;
  standing: ResidentStanding;
  isSelf: boolean;
  /** Whether the viewer sees this person's data in full (own data, or a holder looking at the household). */
  detailed: boolean;
  membershipId: string | null;
  permissions: HouseholdPermission[];
  invitation: InvitationView | null;
}

export interface VehicleView {
  vehicleId: string;
  plate: string;
  make: string | null;
  model: string | null;
  color: string | null;
}

export interface PetView {
  petId: string;
  name: string;
  species: string;
  breed: string | null;
  photoPath: string | null;
}

export interface JoinRequestView {
  requestId: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface HouseholdView {
  tenantId: string;
  unitId: string;
  unitCode: string;
  members: MemberView[];
  vehicles: VehicleView[];
  pets: PetView[];
  requests: JoinRequestView[];
  /** What the viewer can do themself: all three for a holder, the delegated ones for a member. */
  permissions: HouseholdPermission[];
}

/**
 * Turns the unit sheet into what the Mi hogar screens need. `membershipId` is the viewer's own membership: for a
 * holder it identifies their person in the sheet; for a member the one resident row with full details is their own.
 */
export function buildHouseholdView(
  sheet: HouseholdSheet,
  viewer: { membershipId: string; isHolder: boolean },
  now: Date,
): HouseholdView {
  const selfMembership = sheet.memberships.find(
    (membership) => membership.membership_id === viewer.membershipId,
  );
  const members = sheet.residents
    .filter((resident) => isResidentCurrent(resident, now))
    .map((resident): MemberView => {
      // Others' rows carry names only, so a present `person_email` key marks the viewer's own resident row.
      const detailed =
        viewer.isHolder ||
        'person_email' in resident ||
        selfMembership?.person_id === resident.person_id;
      const isSelf = viewer.isHolder
        ? selfMembership?.person_id === resident.person_id
        : 'person_email' in resident;
      const membership = sheet.memberships.find(
        (candidate) =>
          candidate.person_id === resident.person_id &&
          candidate.membership_role === 'household_member' &&
          candidate.membership_status === 'active',
      );
      const invitation = sheet.pending_invitations.find(
        (candidate) =>
          candidate.person_id === resident.person_id &&
          candidate.invitation_status === 'pending',
      );
      return {
        residentId: resident.unit_resident_id,
        personId: resident.person_id,
        firstName: resident.person_first_name ?? '',
        lastName: resident.person_last_name ?? '',
        email: resident.person_email ?? null,
        phone: resident.person_phone ?? null,
        birthDate: resident.person_birth_date ?? null,
        relationship: resident.unit_resident_relationship,
        standing: residentStanding(
          { ...resident, person_birth_date: resident.person_birth_date },
          sheet.memberships,
          sheet.pending_invitations,
          now,
        ),
        isSelf,
        detailed,
        membershipId: membership?.membership_id ?? null,
        permissions: membership
          ? (sheet.member_permissions?.[membership.membership_id] ?? [])
          : [],
        invitation: invitation
          ? {
              invitationId: invitation.invitation_id,
              eventId: invitation.client_event_id,
              email: invitation.invitation_email,
              expiresAt: invitation.invitation_expires_at,
              delivered: invitation.invitation_delivered_at !== null,
            }
          : null,
      };
    });

  return {
    tenantId: sheet.unit.tenant_id,
    unitId: sheet.unit.unit_id,
    unitCode: sheet.unit.unit_code,
    members,
    vehicles: sheet.vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicle_id,
      plate: vehicle.vehicle_plate_code,
      make: vehicle.vehicle_make_name,
      model: vehicle.vehicle_model_name,
      color: vehicle.vehicle_color_name,
    })),
    pets: sheet.pets.map((pet) => ({
      petId: pet.pet_id,
      name: pet.pet_name,
      species: pet.pet_species_name,
      breed: pet.pet_breed_name,
      photoPath: pet.pet_photo_path,
    })),
    requests: sheet.pending_join_requests.map((request) => ({
      requestId: request.unit_join_request_id,
      firstName: request.unit_join_request_first_name,
      lastName: request.unit_join_request_last_name,
      email: request.unit_join_request_email,
      createdAt: request.unit_join_request_created_at,
    })),
    permissions: sheet.permissions,
  };
}
