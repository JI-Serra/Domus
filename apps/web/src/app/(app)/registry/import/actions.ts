'use server';

import { registryImportSchema } from '@domus/domain/registry';
import {
  confirmRegistryImport,
  createRegistryImport,
  previewRegistryImport,
} from '@domus/supabase/registry';
import type { DomusSupabaseClient } from '@domus/supabase/types';
import { revalidatePath } from 'next/cache';
import { isUuid, writableScope } from '@/lib/registry/action';
import { registryErrorKey } from '@/lib/registry/errors';
import { ERROR_ROWS_SHOWN } from '@/lib/registry/import-types';
import type {
  ImportActionResult,
  ImportResult,
  ImportStaged,
} from '@/lib/registry/import-types';

const failure = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

/**
 * Stages the parsed rows in the database (nothing live changes) and answers with the authoritative validation: the
 * rows that have errors. The browser's own validation is a convenience; this is the check that counts.
 */
export async function stageImportAction(
  rows: unknown,
  clientEventId: string,
): Promise<ImportActionResult<ImportStaged>> {
  const checked = await writableScope('registry');
  if ('state' in checked)
    return failure(
      checked.state.status === 'error'
        ? (checked.state.formError ?? 'unknown')
        : 'unknown',
    );
  const { scope } = checked;
  if (!isUuid(clientEventId)) return failure('unknown');
  const parsed = registryImportSchema.safeParse(rows);
  if (!parsed.success) return failure('importInvalidRows');

  const created = await createRegistryImport(scope.client, {
    target_tenant_id: scope.tenantId,
    rows: parsed.data,
    client_event_id: clientEventId,
  });
  if (created.error || !created.data)
    return failure(
      created.error
        ? registryErrorKey(created.error, 'import.stage')
        : 'unknown',
    );
  const importId = created.data;

  const preview = await previewRegistryImport(scope.client, {
    target_tenant_id: scope.tenantId,
    target_import_id: importId,
  });
  if (preview.error || !preview.data)
    return failure(
      preview.error
        ? registryErrorKey(preview.error, 'import.preview')
        : 'unknown',
    );
  const body = preview.data as {
    rows?: {
      row_number: number;
      data: { unit_code?: string } | null;
      errors: string[];
    }[];
  };
  const withErrors = (body.rows ?? []).filter((row) => row.errors.length > 0);
  return {
    ok: true,
    data: {
      importId,
      rowCount: body.rows?.length ?? parsed.data.length,
      errorCount: withErrors.length,
      errorRows: withErrors.slice(0, ERROR_ROWS_SHOWN).map((row) => ({
        row_number: row.row_number,
        unit_code: row.data?.unit_code ?? '',
        errors: row.errors,
      })),
    },
  };
}

interface Snapshot {
  units: number;
  residents: number;
  people: number;
  newest: string;
}

/** Row counts and newest update stamps of what an import can touch: equal before and after = nothing changed. */
async function snapshot(
  client: DomusSupabaseClient,
  tenantId: string,
): Promise<Snapshot> {
  const newest = (a: string | null, b: string | null, c: string | null) =>
    [a, b, c].filter(Boolean).sort().at(-1) ?? '';
  const [units, residents, people] = await Promise.all([
    client
      .from('unit')
      .select('unit_updated_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('unit_updated_at', { ascending: false })
      .limit(1),
    client
      .from('unit_resident')
      .select('unit_resident_updated_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('unit_resident_updated_at', { ascending: false })
      .limit(1),
    client
      .from('person')
      .select('person_updated_at', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('person_updated_at', { ascending: false })
      .limit(1),
  ]);
  return {
    units: units.count ?? 0,
    residents: residents.count ?? 0,
    people: people.count ?? 0,
    newest: newest(
      units.data?.[0]?.unit_updated_at ?? null,
      residents.data?.[0]?.unit_resident_updated_at ?? null,
      people.data?.[0]?.person_updated_at ?? null,
    ),
  };
}

/** Confirms a staged import: one atomic transaction in the database. Re-importing the same data changes nothing. */
export async function confirmImportAction(
  importId: string,
  clientEventId: string,
): Promise<ImportActionResult<ImportResult>> {
  const checked = await writableScope('registry');
  if ('state' in checked)
    return failure(
      checked.state.status === 'error'
        ? (checked.state.formError ?? 'unknown')
        : 'unknown',
    );
  const { scope } = checked;
  if (!isUuid(importId) || !isUuid(clientEventId)) return failure('unknown');

  const before = await snapshot(scope.client, scope.tenantId);
  const { data, error } = await confirmRegistryImport(scope.client, {
    target_tenant_id: scope.tenantId,
    target_import_id: importId,
    client_event_id: clientEventId,
  });
  if (error || !data)
    return failure(
      error ? registryErrorKey(error, 'import.confirm') : 'unknown',
    );
  const result = data as {
    status?: string;
    unit_count?: number;
    resident_count?: number;
    error_count?: number;
  };
  if (result.status !== 'confirmed' && result.status !== 'invalid')
    return failure('unknown');
  const after = await snapshot(scope.client, scope.tenantId);
  revalidatePath('/registry/units');
  return {
    ok: true,
    data: {
      status: result.status,
      unitCount: result.unit_count ?? 0,
      residentCount: result.resident_count ?? 0,
      errorCount: result.error_count ?? 0,
      createdUnits: Math.max(0, after.units - before.units),
      createdResidents: Math.max(0, after.residents - before.residents),
      unchanged:
        result.status === 'confirmed' &&
        before.units === after.units &&
        before.residents === after.residents &&
        before.people === after.people &&
        before.newest === after.newest,
    },
  };
}
