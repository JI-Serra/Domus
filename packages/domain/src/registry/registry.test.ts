import { describe, expect, it } from 'vitest';
import {
  defaultHouseholdPermissions,
  gateInputSchema,
  householdPermissions,
  isBillableUnit,
  isMinorAt,
  normalizePlate,
  neutralizeSpreadsheetFormula,
  normalizeUnitJoinCode,
  personInputSchema,
  petInputSchema,
  registryImportRowSchema,
  registryImportSchema,
  residentInputSchema,
  unitInputSchema,
  unitJoinCodeSchema,
  validateImportRows,
  vehicleInputSchema,
} from './index';

describe('spreadsheet export safety', () => {
  it.each([
    '=HYPERLINK("https://example.test")',
    '+1',
    '-1',
    '@SUM(A1)',
    '\tdata',
    '\rdata',
    '\ndata',
    '  =1',
  ])('neutralizes executable cell %j', (value) => {
    expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
  });
  it.each(['Domus', '123', '', "'=1", 'email@example.test', 'a-b'])(
    'preserves ordinary cell %j',
    (value) => {
      expect(neutralizeSpreadsheetFormula(value)).toBe(value);
    },
  );
});

describe('registry rules and canonical import rows', () => {
  it('inherits billing criteria, applies overrides, and excludes archived units', () => {
    expect(isBillableUnit('occupied', null, ['occupied'], false)).toBe(true);
    expect(isBillableUnit('vacant', undefined, ['occupied'], false)).toBe(
      false,
    );
    expect(isBillableUnit('vacant', true, ['occupied'], false)).toBe(true);
    expect(isBillableUnit('occupied', false, ['occupied'], false)).toBe(false);
    expect(isBillableUnit('occupied', true, ['occupied'], true)).toBe(false);
  });
  it('handles the eighteenth birthday and an explicit minor flag', () => {
    expect(isMinorAt('2008-10-10', false, '2026-10-10')).toBe(false);
    expect(isMinorAt('2008-10-11', false, '2026-10-10')).toBe(true);
    expect(isMinorAt(null, false, '2026-10-10')).toBe(false);
    expect(isMinorAt('1990-01-01', true, '2026-10-10')).toBe(true);
    expect(isMinorAt('2006-03-01', false, '2024-02-29')).toBe(true);
  });
  it('normalizes plates and rejects invalid normalized values', () => {
    expect(normalizePlate('ab 123-cd')).toBe('AB123CD');
    expect(
      vehicleInputSchema.parse({ vehicle_plate_code: 'ab 123 cd' })
        .vehicle_plate_code,
    ).toBe('AB123CD');
    expect(
      vehicleInputSchema.safeParse({ vehicle_plate_code: '--' }).success,
    ).toBe(false);
  });
  it('normalizes typed join codes without accepting ambiguous characters', () => {
    expect(normalizeUnitJoinCode('abcd efgh-jklm')).toBe('ABCDEFGHJKLM');
    expect(unitJoinCodeSchema.parse('abcd-efgh-jklm')).toBe('ABCDEFGHJKLM');
    expect(unitJoinCodeSchema.safeParse('OOOO-IIII-0000').success).toBe(false);
  });
  it('defaults only access authorization permission and validates entity inputs', () => {
    expect(defaultHouseholdPermissions).toEqual([
      'manage_access_authorizations',
    ]);
    expect(householdPermissions).toHaveLength(3);
    expect(unitInputSchema.parse({ unit_code: ' Mz 1 ' }).unit_status).toBe(
      'vacant',
    );
    expect(residentInputSchema.parse({}).unit_resident_is_holder).toBe(false);
    expect(
      residentInputSchema.safeParse({
        unit_resident_is_holder: true,
        unit_resident_is_minor: true,
      }).success,
    ).toBe(false);
    expect(
      personInputSchema.safeParse({
        person_first_name: 'Ana',
        person_last_name: 'Perez',
        person_document_type: 'dni',
      }).success,
    ).toBe(false);
    expect(
      personInputSchema.parse({
        person_first_name: 'Ana',
        person_last_name: 'Perez',
        person_email: 'ANA@example.com',
      }).person_email,
    ).toBe('ana@example.com');
    expect(
      petInputSchema.safeParse({ pet_name: 'Luna', pet_species_name: 'dog' })
        .success,
    ).toBe(true);
    expect(
      gateInputSchema.safeParse({ gate_name: 'Main', gate_kind: 'vehicular' })
        .success,
    ).toBe(true);
  });
  it('accepts unit-only rows and requires names and natural identities for residents', () => {
    expect(
      registryImportRowSchema.parse({ unit_code: ' Mz 1 Lote 2 ' }).unit_code,
    ).toBe('Mz 1 Lote 2');
    for (const row of [
      { unit_code: 'A', person_first_name: 'Ana' },
      { unit_code: 'A', person_last_name: 'Perez' },
      { unit_code: 'A', person_first_name: 'Ana', person_last_name: 'Perez' },
      { unit_code: 'A', person_document_number: '12345678' },
      { unit_code: 'A', unit_resident_is_holder: true },
      {
        unit_code: 'A',
        person_email: 'a@example.com',
        person_first_name: 'Ana',
        person_last_name: 'Perez',
        unit_resident_is_holder: true,
        unit_resident_is_minor: true,
      },
      { unit_code: 'A', user_id: 'forbidden' },
      { unit_code: 'A', unit_coefficient: '1' },
    ])
      expect(registryImportRowSchema.safeParse(row).success).toBe(false);
    expect(
      registryImportRowSchema.safeParse({
        unit_code: 'A',
        person_first_name: 'Ana',
        person_last_name: 'Perez',
        person_document_type: 'dni',
        person_document_number: '12345678',
      }).success,
    ).toBe(true);
    expect(registryImportSchema.safeParse([]).success).toBe(false);
    expect(
      registryImportSchema.safeParse(
        Array.from({ length: 8001 }, () => ({ unit_code: 'A' })),
      ).success,
    ).toBe(false);
  });
  it('returns numbered preview errors and rejects future birthdays and minor holders', () => {
    const result = validateImportRows(
      [
        { unit_code: 'A' },
        {},
        {
          unit_code: 'B',
          person_first_name: 'Ana',
          person_last_name: 'Perez',
          person_email: 'a@example.com',
          person_birth_date: '2030-01-01',
        },
        {
          unit_code: 'C',
          person_first_name: 'Ana',
          person_last_name: 'Perez',
          person_email: 'b@example.com',
          person_birth_date: '2010-01-01',
          unit_resident_is_holder: true,
        },
      ],
      '2026-10-10',
    );
    expect(result[0]?.errors).toEqual([]);
    expect(result[1]?.row_number).toBe(2);
    expect(result[1]?.data).toBe(null);
    expect(result[2]?.errors).toEqual([
      { field: 'person_birth_date', code: 'person_birth_date_invalid' },
    ]);
    expect(result[3]?.errors).toEqual([
      {
        field: 'unit_resident_is_holder',
        code: 'holder_requires_adult_person',
      },
    ]);
  });
});
