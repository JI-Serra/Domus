import { z } from 'zod';

export const unitStatuses = [
  'occupied',
  'under_construction',
  'vacant',
] as const;
export const residentRelationships = [
  'owner',
  'tenant',
  'family',
  'other',
] as const;
export const householdPermissions = [
  'view_unit_finance',
  'book_amenities',
  'manage_access_authorizations',
] as const;
export const defaultHouseholdPermissions = [
  'manage_access_authorizations',
] as const;
const name = z.string().trim().min(1).max(100);
const phone = z.string().trim().min(1).max(32).nullish();
const optionalName = name.nullish();
const email = z
  .string()
  .trim()
  .pipe(z.email())
  .transform((value) => value.toLowerCase())
  .nullish();
const birthday = z.iso.date().nullish();

export const unitInputSchema = z.strictObject({
  unit_id: z.uuid().optional(),
  unit_code: name,
  unit_block_code: optionalName,
  unit_lot_number: optionalName,
  unit_status: z.enum(unitStatuses).default('vacant'),
  unit_coefficient: z.number().positive().lt(100_000_000).default(1),
  unit_is_billable: z.boolean().nullish(),
  unit_contact_phone: phone,
  unit_backup_phone: phone,
});
export const personInputSchema = z
  .strictObject({
    person_id: z.uuid().optional(),
    person_first_name: name,
    person_last_name: name,
    person_document_type: z.enum(['dni', 'passport', 'other']).nullish(),
    person_document_number: z.string().trim().min(1).max(32).nullish(),
    person_email: email,
    person_phone: phone,
    person_birth_date: birthday,
  })
  .refine(
    (row) =>
      Boolean(row.person_document_type) === Boolean(row.person_document_number),
    {
      message: 'person_document_invalid',
      path: ['person_document_number'],
    },
  );
export const residentInputSchema = z
  .strictObject({
    unit_resident_relationship: z.enum(residentRelationships).default('other'),
    unit_resident_is_holder: z.boolean().default(false),
    unit_resident_is_minor: z.boolean().default(false),
    unit_resident_valid_from_at: z.iso.datetime({ offset: true }).optional(),
    unit_resident_valid_to_at: z.iso.datetime({ offset: true }).nullish(),
  })
  .refine(
    (row) => !(row.unit_resident_is_holder && row.unit_resident_is_minor),
    {
      message: 'holder_requires_adult_person',
    },
  );
export const vehicleInputSchema = z.strictObject({
  vehicle_id: z.uuid().optional(),
  vehicle_plate_code: z
    .string()
    .transform(normalizePlate)
    .pipe(z.string().regex(/^[A-Z0-9]{3,12}$/)),
  vehicle_make_name: optionalName,
  vehicle_model_name: optionalName,
  vehicle_color_name: optionalName,
  vehicle_archived_at: z.iso.datetime({ offset: true }).nullish(),
});
export const petInputSchema = z.strictObject({
  pet_id: z.uuid().optional(),
  pet_name: name,
  pet_species_name: name,
  pet_breed_name: optionalName,
  pet_photo_path: z.string().min(1).max(1024).nullish(),
  pet_archived_at: z.iso.datetime({ offset: true }).nullish(),
});
export const gateInputSchema = z.strictObject({
  gate_id: z.uuid().optional(),
  gate_name: name,
  gate_kind: z.enum(['vehicular', 'pedestrian']),
  gate_is_active: z.boolean().default(true),
});

/** Flat parsed CSV/XLSX row. File parsing belongs to the UI; numeric/boolean cells must already be typed. */
export const registryImportRowSchema = z
  .strictObject({
    ...unitInputSchema.omit({ unit_id: true }).shape,
    person_first_name: optionalName,
    person_last_name: optionalName,
    person_document_type: z.enum(['dni', 'passport', 'other']).nullish(),
    person_document_number: z.string().trim().min(1).max(32).nullish(),
    person_email: email,
    person_phone: phone,
    person_birth_date: birthday,
    unit_resident_relationship: z.enum(residentRelationships).default('other'),
    unit_resident_is_holder: z.boolean().default(false),
    unit_resident_is_minor: z.boolean().default(false),
  })
  .superRefine((row, context) => {
    const hasPerson = Boolean(
      row.person_first_name ||
      row.person_last_name ||
      row.person_email ||
      row.person_document_number,
    );
    if (hasPerson) {
      if (!row.person_first_name)
        context.addIssue({
          code: 'custom',
          path: ['person_first_name'],
          message: 'person_first_name_required',
        });
      if (!row.person_last_name)
        context.addIssue({
          code: 'custom',
          path: ['person_last_name'],
          message: 'person_last_name_required',
        });
      if (!row.person_email && !row.person_document_number)
        context.addIssue({
          code: 'custom',
          path: ['person_email'],
          message: 'person_identity_required',
        });
    }
    if (
      Boolean(row.person_document_type) !== Boolean(row.person_document_number)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['person_document_number'],
        message: 'person_document_invalid',
      });
    }
    if (
      row.unit_resident_is_holder &&
      (!hasPerson || row.unit_resident_is_minor)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['unit_resident_is_holder'],
        message: 'holder_requires_adult_person',
      });
    }
  });
export type RegistryImportRow = z.output<typeof registryImportRowSchema>;
export const registryImportSchema = z
  .array(registryImportRowSchema)
  .min(1)
  .max(8000);

export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export function normalizeUnitJoinCode(value: string): string {
  return value.toUpperCase().replace(/[-\s]/g, '');
}
export const unitJoinCodeSchema = z
  .string()
  .transform(normalizeUnitJoinCode)
  .pipe(z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/));

/** NULL inherits the tenant's configured status set. Archived units never count. */
export function isBillableUnit(
  status: (typeof unitStatuses)[number],
  override: boolean | null | undefined,
  criteria: readonly (typeof unitStatuses)[number][],
  archived: boolean,
): boolean {
  return !archived && (override ?? criteria.includes(status));
}
export function isMinorAt(
  birthDate: string | null | undefined,
  declaredMinor: boolean,
  today: string,
): boolean {
  if (declaredMinor) return true;
  if (!birthDate) return false;
  const threshold = new Date(`${today}T00:00:00Z`);
  const month = threshold.getUTCMonth();
  threshold.setUTCFullYear(threshold.getUTCFullYear() - 18);
  if (threshold.getUTCMonth() !== month) threshold.setUTCDate(0);
  return birthDate > threshold.toISOString().slice(0, 10);
}
/** Pure preview for row-level errors; database preview also checks existing natural keys and holder coverage. */
export function validateImportRows(rows: readonly unknown[], today: string) {
  return rows.map((row, index) => {
    const parsed = registryImportRowSchema.safeParse(row);
    if (!parsed.success)
      return {
        row_number: index + 1,
        data: null,
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.message,
        })),
      };
    const errors: { field: string; code: string }[] = [];
    if (
      parsed.data.person_birth_date &&
      parsed.data.person_birth_date > today
    ) {
      errors.push({
        field: 'person_birth_date',
        code: 'person_birth_date_invalid',
      });
    }
    if (
      parsed.data.unit_resident_is_holder &&
      isMinorAt(
        parsed.data.person_birth_date,
        parsed.data.unit_resident_is_minor,
        today,
      )
    ) {
      errors.push({
        field: 'unit_resident_is_holder',
        code: 'holder_requires_adult_person',
      });
    }
    return { row_number: index + 1, data: parsed.data, errors };
  });
}
