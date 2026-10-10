import { describe, expect, it } from 'vitest';
import {
  convertImportCell,
  importColumns,
  importTemplateCsv,
  importTemplateTable,
  normalizeHeader,
  previewImportRows,
  summarizeImportPreview,
  tableToImportRows,
} from './import-file';

describe('import header and cell conversion', () => {
  it('ignores case, accents, spaces and a byte order mark in headers', () => {
    expect(normalizeHeader(`${String.fromCharCode(0xfeff)} Unit Code `)).toBe(
      'unit_code',
    );
    expect(normalizeHeader('Unit-Block-Códe')).toBe('unit_block_code');
    expect(normalizeHeader(undefined)).toBe('');
  });

  it('omits blanks and converts typed cells', () => {
    expect(convertImportCell('unit_code', '  ')).toBeUndefined();
    expect(convertImportCell('unit_code', null)).toBeUndefined();
    expect(convertImportCell('person_document_number', 30123456)).toBe(
      '30123456',
    );
    expect(convertImportCell('unit_lot_number', 7.5)).toBe('7.5');
    expect(convertImportCell('unit_lot_number', true)).toBe('true');
    expect(convertImportCell('person_birth_date', new Date('1985-04-12'))).toBe(
      '1985-04-12',
    );
    expect(convertImportCell('unit_coefficient', '1,5')).toBe(1.5);
    expect(convertImportCell('unit_coefficient', 2)).toBe(2);
    expect(convertImportCell('unit_coefficient', 'abc')).toBe('abc');
  });

  it('understands spanish and english booleans and enum words', () => {
    expect(convertImportCell('unit_resident_is_holder', 'Sí')).toBe(true);
    expect(convertImportCell('unit_resident_is_holder', 'FALSE')).toBe(false);
    expect(convertImportCell('unit_resident_is_holder', true)).toBe(true);
    expect(convertImportCell('unit_is_billable', '1')).toBe(true);
    expect(convertImportCell('unit_resident_is_minor', 'quizás')).toBe(
      'quizás',
    );
    expect(convertImportCell('unit_status', 'Ocupada')).toBe('occupied');
    expect(convertImportCell('unit_status', 'En obra')).toBe(
      'under_construction',
    );
    expect(convertImportCell('unit_status', 'VACANT')).toBe('vacant');
    expect(convertImportCell('unit_resident_relationship', 'Inquilino')).toBe(
      'tenant',
    );
    expect(convertImportCell('person_document_type', 'Pasaporte')).toBe(
      'passport',
    );
  });
});

describe('sheet to import rows', () => {
  it('maps the header, skips empty rows and remembers spreadsheet lines', () => {
    const table = [
      ['Unit Code', 'unit_status', 'Unit_Coefficient', 'person_email', ''],
      ['A1', 'ocupada', '1,25', 'ANA@Ejemplo.com', 'ignored'],
      [null, '', undefined, ' ', ''],
      ['A2', '', '', '', ''],
    ];
    const result = tableToImportRows(table);
    expect(result.missingColumns).toEqual([]);
    expect(result.rows).toEqual([
      {
        unit_code: 'A1',
        unit_status: 'occupied',
        unit_coefficient: 1.25,
        person_email: 'ANA@Ejemplo.com',
      },
      { unit_code: 'A2' },
    ]);
    expect(result.lines).toEqual([2, 4]);
  });

  it('reports unknown, duplicate and missing columns instead of throwing', () => {
    const result = tableToImportRows([
      ['codigo', 'unit_status', 'unit_status', 'Planta'],
      ['A1', 'vacant', 'occupied', '2'],
    ]);
    expect(result.unknownColumns).toEqual(['codigo', 'Planta']);
    expect(result.duplicateColumns).toEqual(['unit_status']);
    expect(result.missingColumns).toEqual(['unit_code']);
    expect(tableToImportRows([]).missingColumns).toEqual(['unit_code']);
  });

  it('reports the same duplicate once', () => {
    const result = tableToImportRows([['unit_code', 'unit_code', 'unit_code']]);
    expect(result.duplicateColumns).toEqual(['unit_code']);
  });
});

describe('template', () => {
  it('lists every column and a valid example row', () => {
    const [header, example] = importTemplateTable();
    expect(header).toEqual([...importColumns]);
    const converted = tableToImportRows(importTemplateTable());
    expect(converted.rows).toHaveLength(1);
    const [preview] = previewImportRows(converted.rows, '2026-10-10');
    expect(preview?.errors).toEqual([]);
    expect(example).toHaveLength(importColumns.length);
  });

  it('writes RFC 4180 CSV with quoting', () => {
    const csv = importTemplateCsv();
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv.startsWith('unit_code,unit_block_code,')).toBe(true);
    expect(csv).toContain('Mz 1 Lote 1,1,1,occupied,1,');
  });
});

describe('local preview', () => {
  const ok = {
    unit_code: 'A1',
    unit_status: 'occupied',
    person_first_name: 'Ana',
    person_last_name: 'Gómez',
    person_email: 'ana@ejemplo.com',
    unit_resident_is_holder: true,
  };

  it('accepts a valid row and applies schema defaults', () => {
    const [row] = previewImportRows([ok], '2026-10-10');
    expect(row?.errors).toEqual([]);
    expect(row?.data?.unit_coefficient).toBe(1);
    expect(row?.row_number).toBe(1);
  });

  it('turns schema failures into codes, never English text', () => {
    const rows = previewImportRows(
      [
        { unit_status: 'occupied' },
        { ...ok, unit_coefficient: 'abc' },
        { ...ok, unit_status: 'nope' },
        { ...ok, person_email: undefined, person_document_number: undefined },
        { unit_code: 'A2', surprise: 1 },
        { ...ok, unit_resident_is_minor: true },
        { unit_code: 'A3', person_birth_date: '3000-01-01' },
      ],
      '2026-10-10',
    );
    const codes = rows.map((row) => row.errors.map((error) => error.code));
    expect(codes[0]).toContain('unit_code_required');
    expect(codes[1]).toEqual(['unit_coefficient_invalid']);
    expect(codes[2]).toEqual(['unit_status_invalid']);
    expect(codes[3]).toContain('person_identity_required');
    expect(codes[4]).toEqual(['unknown_field']);
    expect(codes[5]).toEqual(['holder_requires_adult_person']);
    expect(codes[6]).toEqual(['person_birth_date_invalid']);
    for (const row of rows)
      for (const error of row.errors)
        expect(error.code).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(rows[0]?.data).toBeNull();
  });

  it('does not repeat the same problem for one field', () => {
    const [row] = previewImportRows(
      [{ unit_code: 'A1', unit_coefficient: -1 }],
      '2026-10-10',
    );
    expect(row?.errors).toEqual([
      { field: 'unit_coefficient', code: 'unit_coefficient_invalid' },
    ]);
  });

  it('summarizes rows, units and residents', () => {
    const preview = previewImportRows(
      [ok, { ...ok, person_first_name: 'Beto' }, { unit_code: 'a1' }, {}],
      '2026-10-10',
    );
    expect(summarizeImportPreview(preview)).toEqual({
      rows: 4,
      rowsWithErrors: 1,
      units: 1,
      residents: 2,
    });
  });
});
