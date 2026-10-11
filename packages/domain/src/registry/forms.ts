import { z } from 'zod';
import { adminPermissionSchema } from '../platform';
import { normalizePlate, unitStatuses } from './index';

/** One of the administrative permissions of a tenant administrator (`admin_permission` in the database). */
export type AdminPermission = z.output<typeof adminPermissionSchema>;

/**
 * Validation of the admin registry forms. Inputs are the strings of a submitted form; the messages are KEYS into
 * `registry.errors.*` (the component words them in es-AR), never display text. Outputs match the RPC payloads of
 * `reports/M02-db.md`.
 */

const optionalText = (max: number, tooLong = 'tooLong') =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .transform((value) => (value === '' ? null : value));
const requiredText = (required: string, max = 100) =>
  z.string().trim().min(1, required).max(max, 'tooLong');

const coefficient = z
  .string()
  .trim()
  .transform((value) => (value === '' ? 1 : Number(value.replace(',', '.'))))
  .pipe(
    z
      .number('coefficientInvalid')
      .positive('coefficientInvalid')
      .lt(100_000_000, 'coefficientInvalid'),
  );

/** `inherit` follows the tenant's billable criteria (NULL in the database). */
export const billableChoices = ['inherit', 'yes', 'no'] as const;
export type BillableChoice = (typeof billableChoices)[number];
export function billableFromChoice(choice: BillableChoice): boolean | null {
  return choice === 'inherit' ? null : choice === 'yes';
}
export function billableToChoice(value: boolean | null): BillableChoice {
  return value === null ? 'inherit' : value ? 'yes' : 'no';
}

export const documentTypes = ['dni', 'passport', 'other'] as const;

const personFields = {
  person_first_name: requiredText('firstNameRequired'),
  person_last_name: requiredText('lastNameRequired'),
  person_document_type: z
    .string()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.enum(documentTypes, 'documentInvalid').nullable()),
  person_document_number: optionalText(32, 'documentInvalid'),
  person_email: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(
      z
        .union([z.literal(''), z.email('emailInvalid')])
        .transform((value) => (value === '' ? null : value)),
    ),
  person_phone: optionalText(32, 'phoneInvalid'),
  person_birth_date: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(z.iso.date('birthDateInvalid').nullable()),
};

function personDocumentPair(
  row: {
    person_document_type: string | null;
    person_document_number: string | null;
  },
  context: z.RefinementCtx,
) {
  if (Boolean(row.person_document_type) !== Boolean(row.person_document_number))
    context.addIssue({
      code: 'custom',
      path: ['person_document_number'],
      message: 'documentInvalid',
    });
}

/** The initial holder asked for when a unit is created as occupied. */
export const initialHolderSchema = z
  .object(personFields)
  .superRefine(personDocumentPair)
  .superRefine((row, context) => {
    if (!row.person_email && !row.person_document_number)
      context.addIssue({
        code: 'custom',
        path: ['person_email'],
        message: 'identityRequired',
      });
  });

export const unitFormSchema = z.object({
  unit_code: requiredText('unitCodeRequired'),
  unit_block_code: optionalText(100),
  unit_lot_number: optionalText(100),
  unit_status: z.enum(unitStatuses, 'statusInvalid'),
  unit_coefficient: coefficient,
  unit_is_billable: z
    .enum(billableChoices, 'billableInvalid')
    .transform(billableFromChoice),
  unit_contact_phone: optionalText(32, 'phoneInvalid'),
  unit_backup_phone: optionalText(32, 'phoneInvalid'),
});
export type UnitFormValues = z.output<typeof unitFormSchema>;

export const residentRelationshipChoices = [
  'owner',
  'tenant',
  'family',
  'other',
] as const;

const flag = z
  .string()
  .optional()
  .transform((value) => value === 'on' || value === 'true');

export const residentFormSchema = z
  .object({
    ...personFields,
    unit_resident_relationship: z.enum(
      residentRelationshipChoices,
      'relationshipInvalid',
    ),
    unit_resident_is_holder: flag,
    unit_resident_is_minor: flag,
  })
  .superRefine(personDocumentPair)
  .superRefine((row, context) => {
    if (!row.person_email && !row.person_document_number)
      context.addIssue({
        code: 'custom',
        path: ['person_email'],
        message: 'identityRequired',
      });
    if (row.unit_resident_is_holder && row.unit_resident_is_minor)
      context.addIssue({
        code: 'custom',
        path: ['unit_resident_is_holder'],
        message: 'holderMinor',
      });
  });
export type ResidentFormValues = z.output<typeof residentFormSchema>;

export const vehicleFormSchema = z.object({
  vehicle_plate_code: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().regex(/^[A-Z0-9]{3,12}$/, 'plateInvalid')),
  vehicle_make_name: optionalText(100),
  vehicle_model_name: optionalText(100),
  vehicle_color_name: optionalText(100),
});

export const petFormSchema = z.object({
  pet_name: requiredText('petNameRequired'),
  pet_species_name: requiredText('petSpeciesRequired'),
  pet_breed_name: optionalText(100),
});

export const gateKinds = ['vehicular', 'pedestrian'] as const;
export const gateFormSchema = z.object({
  gate_name: requiredText('gateNameRequired'),
  gate_kind: z.enum(gateKinds, 'gateKindInvalid'),
  gate_is_active: flag,
});

export const residentInvitationRoles = [
  'unit_holder',
  'household_member',
] as const;
export const residentInvitationModes = ['email', 'link'] as const;
export const residentInvitationSchema = z.object({
  invited_email: z
    .string()
    .trim()
    .min(1, 'emailRequired')
    .pipe(z.email('emailInvalid'))
    .transform((value) => value.toLowerCase()),
  target_role: z.enum(residentInvitationRoles, 'roleInvalid'),
  mode: z.enum(residentInvitationModes, 'modeInvalid'),
});

export const guardInvitationSchema = z.object({
  invited_email: residentInvitationSchema.shape.invited_email,
  first_name: requiredText('firstNameRequired'),
  last_name: requiredText('lastNameRequired'),
});

export const devicePairingSchema = z.object({
  device_name: requiredText('deviceNameRequired', 100),
  /** 128-bit code as the database issues it: 32 hex characters, typed in any case with spaces or hyphens. */
  pairing_code: z
    .string()
    .transform((value) => value.replace(/[\s-]/g, '').toLowerCase())
    .pipe(z.string().regex(/^[a-f0-9]{32}$/, 'pairingCodeInvalid')),
});

/** `unit_status` filters of the unit list; anything else is ignored. */
export const unitListFilterSchema = z.object({
  q: z.string().trim().max(100).catch(''),
  status: z.enum(unitStatuses).optional().catch(undefined),
  billable: z.enum(['yes', 'no']).optional().catch(undefined),
  block: z.string().trim().max(100).catch(''),
  archived: z.enum(['yes']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
export type UnitListFilters = z.output<typeof unitListFilterSchema>;
export const UNIT_PAGE_SIZE = 25;

/** Join code in groups of four (`ABCD-EFGH-JKLM`), the way it is shown and typed. */
export function formatJoinCode(code: string): string {
  const compact = code.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return (compact.match(/.{1,4}/g) ?? []).join('-');
}

/** Whole seconds left until `expiresAt` (never negative). */
export function secondsUntil(expiresAt: string | Date, now: Date): number {
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/** `m:ss` for a countdown. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
