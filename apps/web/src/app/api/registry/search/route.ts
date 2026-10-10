import { searchRegistry } from '@domus/supabase/registry';
import { NextResponse } from 'next/server';
import { getAdminScope } from '@/lib/registry/guard';
import { registryErrorKey } from '@/lib/registry/errors';

const RESULT_LIMIT = 8;
const MAX_TERM_LENGTH = 100;

/** A match of the global search, minimal on purpose: what the dropdown shows and where it leads. */
export interface SearchHit {
  kind: 'unit' | 'person' | 'vehicle';
  id: string;
  unitId: string;
  unitCode: string;
  title: string;
  detail: string | null;
}

const KINDS = new Set(['unit', 'person', 'vehicle']);

/**
 * Global registry search of the admin top bar (M02-F08): units, people, plates and emails of the active barrio.
 * Only an administrator with `registry` gets answers (the same 404 as everybody else otherwise); the RPC checks the
 * permission again and escapes the term. Answers are never cached.
 */
export async function GET(request: Request) {
  const noStore = { 'Cache-Control': 'no-store' };
  const scope = await getAdminScope('registry');
  if (!scope)
    return NextResponse.json({ hits: [] }, { status: 404, headers: noStore });
  const term = (new URL(request.url).searchParams.get('q') ?? '')
    .trim()
    .slice(0, MAX_TERM_LENGTH);
  if (term === '') return NextResponse.json({ hits: [] }, { headers: noStore });

  const { data, error } = await searchRegistry(scope.client, {
    target_tenant_id: scope.tenantId,
    search: term,
    result_limit: RESULT_LIMIT,
  });
  if (error) {
    registryErrorKey(error, 'registry.search');
    return NextResponse.json(
      { hits: [] },
      { status: error.code === '42501' ? 403 : 500, headers: noStore },
    );
  }
  const hits: SearchHit[] = data.flatMap((row) =>
    row.unit_id &&
    row.entity_id &&
    row.display_name &&
    KINDS.has(row.entity_kind)
      ? [
          {
            kind: row.entity_kind as SearchHit['kind'],
            id: row.entity_id,
            unitId: row.unit_id,
            unitCode: row.unit_code,
            title: row.display_name,
            detail: row.email ?? row.plate_code,
          },
        ]
      : [],
  );
  return NextResponse.json({ hits }, { headers: noStore });
}
