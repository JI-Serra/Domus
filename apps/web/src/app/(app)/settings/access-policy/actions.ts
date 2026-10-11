'use server';

import {
  accessPolicyTemplateSchema,
  validatePolicy,
} from '@domus/domain/access-policy';
import {
  applyAccessPolicyTemplate,
  updateAccessPolicy,
} from '@domus/supabase/access-policy';
import { revalidatePath } from 'next/cache';
import { formError } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { isUuid, writableScope } from '@/lib/registry/action';
import { accessPolicyErrorKey } from '@/lib/access-policy/errors';

const POLICY_PATH = '/settings/access-policy';

/**
 * Replaces the whole access policy (M03-F01–F04). The payload is validated again with the domain schema; the
 * database validates it a third time and is the real control. `clientEventId` makes a retry idempotent.
 */
export async function saveAccessPolicyAction(
  policy: unknown,
  clientEventId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('access_config');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(clientEventId)) return formError('unknown');
  const parsed = validatePolicy(policy);
  if (!parsed.success) return formError('invalid');

  const { error } = await updateAccessPolicy(scope.client, {
    target_tenant_id: scope.tenantId,
    policy: parsed.data,
    client_event_id: clientEventId,
  });
  if (error) return formError(accessPolicyErrorKey(error, 'accessPolicy.save'));
  revalidatePath(POLICY_PATH);
  return { status: 'success', notice: 'saved' };
}

/** Applies one of the templates (M03-F05); the interface has already shown the diff the person confirmed. */
export async function applyAccessPolicyTemplateAction(
  template: unknown,
  clientEventId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('access_config');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  const parsed = accessPolicyTemplateSchema.safeParse(template);
  if (!parsed.success || !isUuid(clientEventId)) return formError('unknown');

  const { error } = await applyAccessPolicyTemplate(scope.client, {
    target_tenant_id: scope.tenantId,
    template: parsed.data,
    client_event_id: clientEventId,
  });
  if (error)
    return formError(accessPolicyErrorKey(error, 'accessPolicy.apply'));
  revalidatePath(POLICY_PATH);
  return { status: 'success', notice: 'templateApplied' };
}
