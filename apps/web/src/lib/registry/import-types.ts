/** What the import Server Actions hand back to the wizard. Plain data only: it crosses the server boundary. */

export interface ServerPreviewRow {
  /** 1-based position among the data rows (`registry_import_row_number`). */
  row_number: number;
  unit_code: string;
  errors: string[];
}

export interface ImportStaged {
  importId: string;
  rowCount: number;
  errorCount: number;
  /** The rows that have errors (at most `ERROR_ROWS_SHOWN`), in file order. */
  errorRows: ServerPreviewRow[];
}

export interface ImportResult {
  status: 'confirmed' | 'invalid';
  unitCount: number;
  residentCount: number;
  errorCount: number;
  /** Units / residents that did not exist before this import. */
  createdUnits: number;
  createdResidents: number;
  /** True when no stored record changed: re-importing the same file leaves the registry as it was. */
  unchanged: boolean;
}

export type ImportActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string };

export const ERROR_ROWS_SHOWN = 200;
