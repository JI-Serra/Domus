import type { Database } from './database.types';
import type { DomusSupabaseClient } from './types';

type Args<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Args'];
export type AccessPolicyMetadata = Pick<
  Database['public']['Tables']['access_policy']['Row'],
  | 'access_policy_id'
  | 'access_policy_applied_template'
  | 'access_policy_updated_by_user_id'
  | 'access_policy_updated_at'
>;
export type AccessPolicyHistoryEntry =
  Database['public']['Functions']['access_policy_history']['Returns'][number];
export const getAccessPolicy = (
  client: DomusSupabaseClient,
  input: Args<'get_access_policy'>,
) => client.rpc('get_access_policy', input);
export const applyAccessPolicyTemplate = (
  client: DomusSupabaseClient,
  input: Args<'apply_access_policy_template'>,
) => client.rpc('apply_access_policy_template', input);
export const updateAccessPolicy = (
  client: DomusSupabaseClient,
  input: Args<'update_access_policy'>,
) => client.rpc('update_access_policy', input);
export const accessPolicyHistory = (
  client: DomusSupabaseClient,
  input: Args<'access_policy_history'>,
) => client.rpc('access_policy_history', input);
