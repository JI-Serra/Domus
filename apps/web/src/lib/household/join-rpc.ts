import {
  cancelUnitJoinRequest,
  myUnitJoinRequests,
  submitUnitJoinRequest,
} from '@domus/supabase/registry';
import type { Database } from '@domus/supabase/database.types';
import type { DomusSupabaseClient } from '@domus/supabase/types';

const SUBMISSION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'unavailable',
] as const;
export type JoinSubmission = (typeof SUBMISSION_STATUSES)[number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Asks to join a unit with its code. The barrio is derived from the code on the server, so the caller never names
 * one; every unusable code answers the same `unavailable`.
 */
export async function submitJoinRequest(
  client: DomusSupabaseClient,
  input: {
    join_code: string;
    person_data: Record<string, string>;
    client_event_id: string;
  },
): Promise<{ status: JoinSubmission } | { error: string }> {
  const { data, error } = await submitUnitJoinRequest(client, input);
  if (error) return { error: error.code ?? 'unknown' };
  const status = isRecord(data) ? data.status : undefined;
  return SUBMISSION_STATUSES.find((known) => known === status)
    ? { status: status as JoinSubmission }
    : { error: 'unknown' };
}

export type MyJoinRequest =
  Database['public']['Functions']['my_unit_join_requests']['Returns'][number];

/** The caller's own requests, newest first, with the barrio and unit they asked for. */
export async function listMyJoinRequests(
  client: DomusSupabaseClient,
): Promise<MyJoinRequest[]> {
  const { data, error } = await myUnitJoinRequests(client);
  return error || !data ? [] : data;
}

export async function cancelJoinRequest(
  client: DomusSupabaseClient,
  requestId: string,
  clientEventId: string,
): Promise<{ error: string | null }> {
  const { error } = await cancelUnitJoinRequest(client, {
    target_unit_join_request_id: requestId,
    client_event_id: clientEventId,
  });
  return { error: error ? (error.code ?? 'unknown') : null };
}
