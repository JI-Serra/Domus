import type { DomusSupabaseClient } from '@domus/supabase/types';

/**
 * Join-by-code RPCs (D22). `submit_unit_join_request` without a tenant, `my_unit_join_requests` and
 * `cancel_unit_join_request` are the T18 additions the coordinator specified; until `pnpm gen:types` brings them
 * into `database.types.ts` they are called through this one loosely typed seam, and every answer is validated
 * here. Replace the cast with the typed wrappers in `@domus/supabase/registry` once the types exist.
 */
interface LooseClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}
const loose = (client: DomusSupabaseClient) => client as unknown as LooseClient;

const SUBMISSION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'unavailable',
] as const;
export type JoinSubmission = (typeof SUBMISSION_STATUSES)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The tenant is derived from the code on the server; every unusable code answers the same `unavailable`. */
export async function submitJoinRequest(
  client: DomusSupabaseClient,
  input: {
    join_code: string;
    person_data: Record<string, string | null>;
    client_event_id: string;
  },
): Promise<{ status: JoinSubmission } | { error: string }> {
  const { data, error } = await loose(client).rpc(
    'submit_unit_join_request',
    input,
  );
  if (error) return { error: error.code ?? 'unknown' };
  const status = isRecord(data) ? data.status : undefined;
  return SUBMISSION_STATUSES.find((known) => known === status)
    ? { status: status as JoinSubmission }
    : { error: 'unknown' };
}

export interface MyJoinRequest {
  unit_join_request_id: string;
  unit_join_request_status: 'pending' | 'approved' | 'rejected';
  unit_join_request_created_at: string;
  tenant_name: string;
  unit_code: string;
}

function isMyJoinRequest(value: unknown): value is MyJoinRequest {
  return (
    isRecord(value) &&
    typeof value.unit_join_request_id === 'string' &&
    ['pending', 'approved', 'rejected'].includes(
      String(value.unit_join_request_status),
    ) &&
    typeof value.unit_join_request_created_at === 'string' &&
    typeof value.tenant_name === 'string' &&
    typeof value.unit_code === 'string'
  );
}

/** The caller's own requests, with the barrio and unit they asked for. */
export async function listMyJoinRequests(
  client: DomusSupabaseClient,
): Promise<MyJoinRequest[]> {
  const { data, error } = await loose(client).rpc('my_unit_join_requests');
  if (error || !Array.isArray(data)) return [];
  return data.filter(isMyJoinRequest);
}

export async function cancelJoinRequest(
  client: DomusSupabaseClient,
  requestId: string,
  clientEventId: string,
): Promise<{ error: string | null }> {
  const { error } = await loose(client).rpc('cancel_unit_join_request', {
    target_unit_join_request_id: requestId,
    client_event_id: clientEventId,
  });
  return { error: error ? (error.code ?? 'unknown') : null };
}
