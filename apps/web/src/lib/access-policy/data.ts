import {
  accessPolicySchema,
  accessPolicyTemplateSchema,
  diffPolicy,
  validatePolicy,
} from '@domus/domain/access-policy';
import type {
  AccessPolicy,
  AccessPolicyTemplate,
  PolicyChange,
} from '@domus/domain/access-policy';
import { reportError } from '@domus/observability';
import {
  accessPolicyHistory,
  getAccessPolicy,
} from '@domus/supabase/access-policy';
import type { AccessPolicyMetadata } from '@domus/supabase/access-policy';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

export interface LoadedAccessPolicy {
  policy: AccessPolicy;
  /** Only administrators with `access_config` receive it; members, guards and other administrators get `null`. */
  metadata: AccessPolicyMetadata | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseMetadata(value: unknown): AccessPolicyMetadata | null {
  if (!isRecord(value)) return null;
  const template =
    value.access_policy_applied_template === null
      ? null
      : accessPolicyTemplateSchema.safeParse(
          value.access_policy_applied_template,
        );
  if (
    typeof value.access_policy_id !== 'string' ||
    typeof value.access_policy_updated_at !== 'string' ||
    template === undefined ||
    (template !== null && !template.success)
  )
    return null;
  return {
    access_policy_id: value.access_policy_id,
    access_policy_applied_template: template === null ? null : template.data,
    access_policy_updated_by_user_id:
      typeof value.access_policy_updated_by_user_id === 'string'
        ? value.access_policy_updated_by_user_id
        : null,
    access_policy_updated_at: value.access_policy_updated_at,
  };
}

/**
 * The access policy of a barrio (M03). Any active member of the tenant may read it, so this is also the loader M04
 * (what a household may choose) and M05 (what the gate enforces) consume: `policy` is validated with the domain
 * schema, never trusted as raw JSON. Throws when the database refuses or answers with something else than a policy.
 */
export async function loadAccessPolicy(
  client: Client,
  tenantId: string,
): Promise<LoadedAccessPolicy> {
  const { data, error } = await getAccessPolicy(client, {
    target_tenant_id: tenantId,
  });
  if (error)
    throw new Error(`Could not load the access policy (${error.code})`);
  if (!isRecord(data)) throw new Error('Could not read the access policy');
  const policy = accessPolicySchema.safeParse(data.policy);
  if (!policy.success) throw new Error('Could not read the access policy');
  return { policy: policy.data, metadata: parseMetadata(data.metadata) };
}

export interface PolicyHistoryItem {
  eventId: string;
  occurredAt: string;
  /** The user who made the change (for a support session, the real actor). */
  actorUserId: string | null;
  onBehalfOfUserId: string | null;
  isSupport: boolean;
  /** The template this change applied; `null` for a manual edit. */
  appliedTemplate: AccessPolicyTemplate | null;
  changes: PolicyChange[];
}

/** Newest first. A snapshot that no longer parses (a bug, never user input) shows as an entry without value changes. */
export async function loadAccessPolicyHistory(
  client: Client,
  tenantId: string,
  limit = 100,
): Promise<PolicyHistoryItem[]> {
  const { data, error } = await accessPolicyHistory(client, {
    target_tenant_id: tenantId,
  });
  if (error)
    throw new Error(`Could not load the policy history (${error.code})`);
  return data.slice(0, limit).map((row) => {
    const before = validatePolicy(row.before_policy);
    const after = validatePolicy(row.after_policy);
    if (!before.success || !after.success)
      reportError(new Error('Access policy history snapshot is not a policy'), {
        operation: 'accessPolicy.history',
      });
    const template = accessPolicyTemplateSchema.safeParse(
      row.access_policy_applied_template,
    );
    return {
      eventId: row.audit_event_id,
      occurredAt: row.audit_event_occurred_at,
      actorUserId: row.audit_event_actor_user_id ?? null,
      onBehalfOfUserId: row.audit_event_on_behalf_of_user_id ?? null,
      isSupport: Boolean(row.support_session_id),
      appliedTemplate: template.success ? template.data : null,
      changes:
        before.success && after.success
          ? diffPolicy(before.data, after.data)
          : [],
    };
  });
}

/** First and last name of the people behind a set of user ids, when the viewer may read the registry. */
export async function loadPersonNames(
  client: Client,
  tenantId: string,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return names;
  const { data } = await client
    .from('person')
    .select('user_id, person_first_name, person_last_name')
    .eq('tenant_id', tenantId)
    .in('user_id', ids);
  for (const person of data ?? [])
    if (person.user_id)
      names.set(
        person.user_id,
        `${person.person_first_name} ${person.person_last_name}`.trim(),
      );
  return names;
}
