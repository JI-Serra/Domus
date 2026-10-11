import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  importTemplateCsv,
  importTemplateTable,
  previewImportRows,
  tableToImportRows,
} from '@domus/domain/registry-ui';
import type { ImportRowPreview } from '@domus/domain/registry-ui';

export type ImportFileProblem =
  | 'type'
  | 'tooLarge'
  | 'unreadable'
  | 'empty'
  | 'tooManyRows'
  | 'missingColumns'
  | 'duplicateColumns';

export class ImportFileError extends Error {
  constructor(
    readonly problem: ImportFileProblem,
    readonly columns: readonly string[] = [],
  ) {
    super(problem);
    this.name = 'ImportFileError';
  }
}

export interface ParsedImport {
  /** Typed rows as the server expects them (empty rows already dropped). */
  rows: Record<string, unknown>[];
  /** Spreadsheet line of each row, for messages the person can find in Excel. */
  lines: number[];
  preview: ImportRowPreview[];
  /** Header names that are not part of the template (they are ignored and reported). */
  unknownColumns: string[];
}

/**
 * Reads the cells of the first sheet in the browser. CSV goes through Papa Parse (delimiter detected, so a
 * semicolon-separated Excel export works); XLSX through `read-excel-file`, which returns the stored cell values and
 * never evaluates formulas or macros. Both libraries load only when a file is chosen.
 */
export async function readImportTable(file: File): Promise<unknown[][]> {
  if (file.size > IMPORT_MAX_FILE_BYTES) throw new ImportFileError('tooLarge');
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.xlsx')) {
      const { readSheet } = await import('read-excel-file/browser');
      return (await readSheet(file)) as unknown[][];
    }
    if (name.endsWith('.csv')) {
      const { default: Papa } = await import('papaparse');
      const parsed = Papa.parse<string[]>(await file.text(), {
        skipEmptyLines: 'greedy',
      });
      return parsed.data;
    }
  } catch {
    throw new ImportFileError('unreadable');
  }
  throw new ImportFileError('type');
}

/** Parses and locally validates an import file. Throws `ImportFileError` for problems with the file as a whole. */
export async function parseImportFile(
  file: File,
  today: string,
): Promise<ParsedImport> {
  const table = await readImportTable(file);
  const converted = tableToImportRows(table);
  if (converted.missingColumns.length > 0)
    throw new ImportFileError('missingColumns', converted.missingColumns);
  if (converted.duplicateColumns.length > 0)
    throw new ImportFileError('duplicateColumns', converted.duplicateColumns);
  if (converted.rows.length === 0) throw new ImportFileError('empty');
  if (converted.rows.length > IMPORT_MAX_ROWS)
    throw new ImportFileError('tooManyRows');
  return {
    rows: converted.rows,
    lines: converted.lines,
    preview: previewImportRows(converted.rows, today),
    unknownColumns: converted.unknownColumns,
  };
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads the CSV template (UTF-8 with a byte order mark, so Excel reads the accents). */
export function downloadCsvTemplate() {
  download(
    new Blob(['﻿', importTemplateCsv()], {
      type: 'text/csv;charset=utf-8',
    }),
    'domus-padron-plantilla.csv',
  );
}

/** Downloads the XLSX template: the same header and example row (identifiers as text, flags as booleans). */
export async function downloadXlsxTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const [header = [], ...body] = importTemplateTable();
  const data = [
    header.map((value) => ({
      value: String(value),
      fontWeight: 'bold' as const,
    })),
    ...body.map((row) => row.map((value) => (value === '' ? null : { value }))),
  ];
  const blob = await writeXlsxFile(data).toBlob();
  download(blob, 'domus-padron-plantilla.xlsx');
}
