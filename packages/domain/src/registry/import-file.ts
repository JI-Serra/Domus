import type { z } from 'zod';
import { registryImportRowSchema } from './index';

/** Columns of the import template, in the order of the fixture and the contract (`reports/M02-db.md`). */
export const importColumns = [
  'unit_code',
  'unit_block_code',
  'unit_lot_number',
  'unit_status',
  'unit_coefficient',
  'unit_is_billable',
  'unit_contact_phone',
  'unit_backup_phone',
  'person_first_name',
  'person_last_name',
  'person_document_type',
  'person_document_number',
  'person_email',
  'person_phone',
  'person_birth_date',
  'unit_resident_relationship',
  'unit_resident_is_holder',
  'unit_resident_is_minor',
] as const;
export type ImportColumn = (typeof importColumns)[number];

/** Largest file the browser will parse (the database accepts at most 8,000 rows, far below this). */
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 8000;

const BOOLEAN_COLUMNS: ReadonlySet<string> = new Set([
  'unit_is_billable',
  'unit_resident_is_holder',
  'unit_resident_is_minor',
]);
const ENUM_ALIASES: Partial<Record<ImportColumn, Record<string, string>>> = {
  unit_status: {
    ocupada: 'occupied',
    'en obra': 'under_construction',
    en_obra: 'under_construction',
    vacia: 'vacant',
    vacía: 'vacant',
  },
  unit_resident_relationship: {
    propietario: 'owner',
    propietaria: 'owner',
    inquilino: 'tenant',
    inquilina: 'tenant',
    familiar: 'family',
    familia: 'family',
    otro: 'other',
    otra: 'other',
  },
  person_document_type: {
    pasaporte: 'passport',
    otro: 'other',
  },
};
const TRUE_WORDS = new Set(['true', '1', 'si', 'sí', 'yes', 'verdadero', 'x']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'falso']);

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

/** `" Unit Code "` → `unit_code`: case, accents, spaces and hyphens do not matter in a header. */
export function normalizeHeader(raw: unknown): string {
  const text = String(raw ?? '');
  return (text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const isColumn = (name: string): name is ImportColumn =>
  (importColumns as readonly string[]).includes(name);

function isBlank(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function plainText(value: unknown): string {
  if (typeof value === 'number')
    return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

/**
 * One spreadsheet cell as the typed value the import schema expects. Blank cells are omitted (the schema supplies
 * defaults); anything that cannot be understood is left as typed, so the schema reports it on that row instead of the
 * parser guessing.
 */
export function convertImportCell(
  column: ImportColumn,
  value: unknown,
): unknown {
  if (isBlank(value)) return undefined;
  if (column === 'unit_coefficient') {
    if (typeof value === 'number') return value;
    const text = plainText(value).replace(',', '.');
    const parsed = Number(text);
    return text !== '' && Number.isFinite(parsed) ? parsed : plainText(value);
  }
  if (BOOLEAN_COLUMNS.has(column)) {
    if (typeof value === 'boolean') return value;
    const word = plainText(value).toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    return plainText(value);
  }
  const text = plainText(value);
  const aliases = ENUM_ALIASES[column];
  if (aliases) {
    const lowered = text.toLowerCase();
    return aliases[lowered] ?? lowered;
  }
  return text;
}

export interface ImportTable {
  /** Typed rows, ready for `registryImportRowSchema` and the `create_registry_import` RPC. */
  rows: Record<string, unknown>[];
  /** Line each row has in the spreadsheet (the header is line 1), for messages the person can find in Excel. */
  lines: number[];
  /** Header names that are not part of the template. */
  unknownColumns: string[];
  /** Required header names that are missing. */
  missingColumns: string[];
  /** The same header appears twice. */
  duplicateColumns: string[];
}

/**
 * Turns the cells of a sheet (first row = header) into typed import rows. Pure and tolerant: header case/accents are
 * ignored, empty rows are skipped, spreadsheet types are converted. Structural problems are reported, not thrown.
 */
export function tableToImportRows(
  table: readonly (readonly unknown[])[],
): ImportTable {
  const result: ImportTable = {
    rows: [],
    lines: [],
    unknownColumns: [],
    missingColumns: [],
    duplicateColumns: [],
  };
  const [header, ...body] = table;
  if (!header) {
    result.missingColumns.push('unit_code');
    return result;
  }
  const columns: (ImportColumn | null)[] = [];
  const seen = new Set<string>();
  header.forEach((cell) => {
    const name = normalizeHeader(cell);
    if (name === '') {
      columns.push(null);
      return;
    }
    if (!isColumn(name)) {
      result.unknownColumns.push(String(cell).trim());
      columns.push(null);
      return;
    }
    if (seen.has(name)) {
      if (!result.duplicateColumns.includes(name))
        result.duplicateColumns.push(name);
      columns.push(null);
      return;
    }
    seen.add(name);
    columns.push(name);
  });
  if (!seen.has('unit_code')) result.missingColumns.push('unit_code');

  body.forEach((cells, index) => {
    if (cells.every(isBlank)) return;
    const row: Record<string, unknown> = {};
    columns.forEach((column, position) => {
      if (!column) return;
      const converted = convertImportCell(column, cells[position]);
      if (converted !== undefined) row[column] = converted;
    });
    result.rows.push(row);
    result.lines.push(index + 2);
  });
  return result;
}

/** Rows of the downloadable template: the header and one example unit with its holder. */
export function importTemplateTable(): (string | number | boolean)[][] {
  return [
    [...importColumns],
    [
      'Mz 1 Lote 1',
      '1',
      '1',
      'occupied',
      1,
      '',
      '',
      '',
      'Mariana',
      'Lopez',
      'dni',
      '30123456',
      'mariana@ejemplo.com',
      '',
      '1985-04-12',
      'owner',
      true,
      false,
    ],
  ];
}

/** The template as CSV text (RFC 4180 quoting, `\r\n` line ends, UTF-8). */
export function importTemplateCsv(): string {
  const quote = (cell: string | number | boolean) => {
    const text = String(cell);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return importTemplateTable()
    .map((row) => row.map(quote).join(','))
    .join('\r\n');
}

export interface ImportRowIssue {
  field: string;
  /** Stable code; the UI words it in es-AR (`registry.import.codes.*`). */
  code: string;
}
export interface ImportRowPreview {
  /** 1-based position among the data rows: what the server calls `row_number`. */
  row_number: number;
  data: z.output<typeof registryImportRowSchema> | null;
  errors: ImportRowIssue[];
}

const CODE = /^[a-z][a-z0-9_]*$/;

function issueCode(
  issue: z.core.$ZodIssue,
  row: Record<string, unknown>,
): ImportRowIssue {
  const field = String(issue.path[0] ?? 'row');
  if (CODE.test(issue.message)) return { field, code: issue.message };
  if (issue.code === 'unrecognized_keys')
    return { field: 'row', code: 'unknown_field' };
  const missing = row[field] === undefined;
  return { field, code: `${field}_${missing ? 'required' : 'invalid'}` };
}

/**
 * Local (browser-side) validation of typed rows with the contract's schema. Errors carry codes, never Zod's English
 * text. The database repeats this and adds what only it can see (existing people, holders, other rows).
 */
export function previewImportRows(
  rows: readonly Record<string, unknown>[],
  today: string,
): ImportRowPreview[] {
  return rows.map((row, index) => {
    const parsed = registryImportRowSchema.safeParse(row);
    if (!parsed.success) {
      const seen = new Set<string>();
      const errors = parsed.error.issues
        .map((issue) => issueCode(issue, row))
        .filter((issue) => {
          const key = `${issue.field}:${issue.code}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      return { row_number: index + 1, data: null, errors };
    }
    const errors: ImportRowIssue[] = [];
    if (parsed.data.person_birth_date && parsed.data.person_birth_date > today)
      errors.push({
        field: 'person_birth_date',
        code: 'person_birth_date_invalid',
      });
    return { row_number: index + 1, data: parsed.data, errors };
  });
}

/** Counts for the summary above the preview table. */
export function summarizeImportPreview(preview: readonly ImportRowPreview[]): {
  rows: number;
  rowsWithErrors: number;
  units: number;
  residents: number;
} {
  const units = new Set<string>();
  let residents = 0;
  let rowsWithErrors = 0;
  for (const row of preview) {
    if (row.errors.length > 0) rowsWithErrors += 1;
    if (!row.data) continue;
    units.add(row.data.unit_code.toLowerCase());
    if (row.data.person_first_name) residents += 1;
  }
  return { rows: preview.length, rowsWithErrors, units: units.size, residents };
}
