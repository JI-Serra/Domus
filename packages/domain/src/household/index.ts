import { z } from 'zod';
import {
  householdPermissions,
  isMinorAt,
  normalizePlate,
  normalizeUnitJoinCode,
  residentRelationships,
  unitJoinCodeSchema,
} from '../registry';

export type HouseholdPermission = (typeof householdPermissions)[number];

/**
 * Next permission set after one toggle. The database replaces the whole set, so the UI always sends the complete
 * set, in the canonical order and without duplicates.
 */
export function togglePermission(
  current: readonly HouseholdPermission[],
  permission: HouseholdPermission,
  enabled: boolean,
): HouseholdPermission[] {
  const next = new Set(current);
  if (enabled) next.add(permission);
  else next.delete(permission);
  return householdPermissions.filter((entry) => next.has(entry));
}

export interface ResidentWindow {
  unit_resident_valid_from_at: string;
  unit_resident_valid_to_at: string | null;
}

/** A residence counts while `[from, to)` contains the instant; the unit sheet also lists ended residences. */
export function isResidentCurrent(
  resident: ResidentWindow,
  now: Date,
): boolean {
  const from = Date.parse(resident.unit_resident_valid_from_at);
  if (Number.isNaN(from) || from > now.getTime()) return false;
  if (resident.unit_resident_valid_to_at === null) return true;
  const to = Date.parse(resident.unit_resident_valid_to_at);
  return !Number.isNaN(to) && now.getTime() < to;
}

export interface ResidentFacts extends ResidentWindow {
  person_id: string;
  unit_resident_is_holder: boolean;
  unit_resident_is_minor: boolean;
  person_birth_date?: string | null;
}
export interface MembershipFacts {
  person_id: string;
  membership_role: string;
  membership_status: string;
  membership_valid_from: string;
  membership_valid_to: string | null;
}
export interface InvitationFacts {
  person_id: string | null;
  invitation_status: string;
  invitation_expires_at: string;
}

/**
 * Where a resident stands in the household, which decides the actions the holder is offered:
 * - `holder`: manages the household; another holder can't edit or end this residence.
 * - `minor`: never gets an account or permissions.
 * - `member`: has an active account in the unit (delegations apply).
 * - `invited`: has a pending, unexpired invitation.
 * - `unregistered`: a resident without account who can be invited.
 */
export type ResidentStanding =
  'holder' | 'minor' | 'member' | 'invited' | 'unregistered';

export function residentStanding(
  resident: ResidentFacts,
  memberships: readonly MembershipFacts[],
  invitations: readonly InvitationFacts[],
  now: Date,
): ResidentStanding {
  if (resident.unit_resident_is_holder) return 'holder';
  if (
    isMinorAt(
      resident.person_birth_date,
      resident.unit_resident_is_minor,
      now.toISOString().slice(0, 10),
    )
  )
    return 'minor';
  const hasAccount = memberships.some(
    (membership) =>
      membership.person_id === resident.person_id &&
      membership.membership_role === 'household_member' &&
      membership.membership_status === 'active' &&
      Date.parse(membership.membership_valid_from) <= now.getTime() &&
      (membership.membership_valid_to === null ||
        now.getTime() < Date.parse(membership.membership_valid_to)),
  );
  if (hasAccount) return 'member';
  const isInvited = invitations.some(
    (invitation) =>
      invitation.person_id === resident.person_id &&
      invitation.invitation_status === 'pending' &&
      Date.parse(invitation.invitation_expires_at) > now.getTime(),
  );
  return isInvited ? 'invited' : 'unregistered';
}

export type PlateKind =
  'car_mercosur' | 'car_legacy' | 'motorcycle_mercosur' | 'motorcycle_legacy';

const PLATE_FORMATS: readonly {
  kind: PlateKind;
  pattern: RegExp;
  /** Group lengths, for the spaced display. */
  groups: readonly number[];
}[] = [
  {
    kind: 'car_mercosur',
    pattern: /^[A-Z]{2}\d{3}[A-Z]{2}$/,
    groups: [2, 3, 2],
  },
  { kind: 'car_legacy', pattern: /^[A-Z]{3}\d{3}$/, groups: [3, 3] },
  {
    kind: 'motorcycle_mercosur',
    pattern: /^[A-Z]\d{3}[A-Z]{3}$/,
    groups: [1, 3, 3],
  },
  { kind: 'motorcycle_legacy', pattern: /^\d{3}[A-Z]{3}$/, groups: [3, 3] },
];

/** Argentine plate format of the value, or null for anything else (foreign plates are accepted too). */
export function classifyPlate(value: string): PlateKind | null {
  const plate = normalizePlate(value);
  return PLATE_FORMATS.find((entry) => entry.pattern.test(plate))?.kind ?? null;
}

/** Plate as people write it ("AB 123 CD"); other formats are shown normalized. */
export function formatPlate(value: string): string {
  const plate = normalizePlate(value);
  const known = PLATE_FORMATS.find((entry) => entry.pattern.test(plate));
  if (!known) return plate;
  let offset = 0;
  return known.groups
    .map((length) => {
      const part = plate.slice(offset, offset + length);
      offset += length;
      return part;
    })
    .join(' ');
}

const JOIN_CODE_LENGTH = 12;
const JOIN_CODE_GROUP = 4;

/**
 * Shapes what the user types or pastes into the unit-code field: upper case, only letters and digits, at most twelve
 * characters, grouped 4-4-4 with hyphens. "abcd efgh jkmn" and "ABCD-EFGH-JKMN" end up the same.
 */
export function formatJoinCodeInput(value: string): string {
  const compact = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, JOIN_CODE_LENGTH);
  const groups: string[] = [];
  for (let index = 0; index < compact.length; index += JOIN_CODE_GROUP)
    groups.push(compact.slice(index, index + JOIN_CODE_GROUP));
  return groups.join('-');
}

const requiredName = (key: string) =>
  z.string().trim().min(1, key).max(100, 'nameTooLong');
/** Optional text field: an empty string means "not given". */
const optionalText = (max: number, key: string) =>
  z
    .string()
    .trim()
    .max(max, key)
    .transform((value) => (value === '' ? null : value))
    .nullish();
const optionalBirthDate = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(z.iso.date('birthDateInvalid').nullable())
  .nullish();
const optionalEmail = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value.toLowerCase()))
  .pipe(z.email('emailInvalid').nullable())
  .nullish();

const memberShape = {
  person_first_name: requiredName('firstNameRequired'),
  person_last_name: requiredName('lastNameRequired'),
  person_phone: optionalText(32, 'phoneInvalid'),
  person_birth_date: optionalBirthDate,
  unit_resident_relationship: z.enum(
    residentRelationships,
    'relationshipInvalid',
  ),
  person_email: optionalEmail,
};

/** "Agregar miembro": an adult needs an email (the invitation goes there); a minor is registered without account. */
export const memberFormSchema = z
  .object({ ...memberShape, is_minor: z.boolean().default(false) })
  .superRefine((value, context) => {
    if (!value.is_minor && !value.person_email)
      context.addIssue({
        code: 'custom',
        path: ['person_email'],
        message: 'emailRequired',
      });
  });

/** Edit of an existing resident. */
export const memberDetailsSchema = z.object(memberShape);

/** Invite an existing resident: only the destination of the invitation. */
export const memberInvitationSchema = z.object({
  person_email: z
    .string()
    .trim()
    .min(1, 'emailRequired')
    .pipe(z.email('emailInvalid'))
    .transform((value) => value.toLowerCase()),
});

export const vehicleFormSchema = z.object({
  vehicle_plate_code: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().regex(/^[A-Z0-9]{3,12}$/, 'plateInvalid')),
  vehicle_make_name: optionalText(100, 'nameTooLong'),
  vehicle_model_name: optionalText(100, 'nameTooLong'),
  vehicle_color_name: optionalText(100, 'nameTooLong'),
});

export const petFormSchema = z.object({
  pet_name: requiredName('petNameRequired'),
  pet_species_name: requiredName('petSpeciesRequired'),
  pet_breed_name: optionalText(100, 'nameTooLong'),
});

/** Pet photos: private bucket `pet-photo`, PNG/JPEG/WebP up to 2 MiB (`reports/M02-db.md`). */
export const PET_PHOTO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;
export const PET_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<(typeof PET_PHOTO_MIME_TYPES)[number], string> =
  { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

export function petPhotoProblem(file: {
  type: string;
  size: number;
}): 'photoType' | 'photoSize' | null {
  if (!(PET_PHOTO_MIME_TYPES as readonly string[]).includes(file.type))
    return 'photoType';
  return file.size > PET_PHOTO_MAX_BYTES ? 'photoSize' : null;
}

/** `tenant_id/unit_id/<file id>.<ext>`: the path the storage policy and `pet_photo_path_check` expect. */
export function petPhotoPath(
  tenantId: string,
  unitId: string,
  fileId: string,
  mimeType: string,
): string {
  const extension =
    PHOTO_EXTENSIONS[mimeType as (typeof PET_PHOTO_MIME_TYPES)[number]];
  return `${tenantId}/${unitId}/${fileId}.${extension}`;
}

/** True when `path` is a photo path inside this unit's folder (what a client may ask the server to store). */
export function isPetPhotoPathOf(
  path: string,
  tenantId: string,
  unitId: string,
): boolean {
  return (
    path.startsWith(`${tenantId}/${unitId}/`) &&
    /^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(
      path.slice(`${tenantId}/${unitId}/`.length),
    )
  );
}

/**
 * Request to join a unit with its code (D22): the code and the minimum personal data. The email is the verified one
 * of the account, never typed. A document needs both its type and its number. Any malformed code gets the same key
 * as one that doesn't exist, so the form never says which of the two it was.
 */
export const joinRequestFormSchema = z
  .object({
    join_code: z
      .string()
      .refine((value) => unitJoinCodeSchema.safeParse(value).success, {
        message: 'codeUnavailable',
      })
      .transform(normalizeUnitJoinCode),
    person_first_name: requiredName('firstNameRequired'),
    person_last_name: requiredName('lastNameRequired'),
    person_document_type: z
      .string()
      .transform((value) => (value === '' ? null : value))
      .pipe(z.enum(['dni', 'passport', 'other']).nullable())
      .nullish(),
    person_document_number: optionalText(32, 'documentInvalid'),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.person_document_type) !==
      Boolean(value.person_document_number)
    )
      context.addIssue({
        code: 'custom',
        path: [
          value.person_document_type
            ? 'person_document_number'
            : 'person_document_type',
        ],
        message: 'documentIncomplete',
      });
  });
