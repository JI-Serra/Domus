import { formError } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { getAdminScope, UUID_PATTERN } from './guard';
import type { AdminScope } from './guard';
import type { AdminPermission } from './permissions';

export type ScopeOrState = { scope: AdminScope } | { state: PlatformFormState };

/**
 * First step of every registry Server Action: the administrator's scope when they hold `permission` and the barrio
 * accepts writes, otherwise the state to answer with (`denied` / `readOnly`). Hiding a button is never the control:
 * the database repeats both checks.
 */
export async function writableScope(
  permission: AdminPermission,
  values?: Record<string, string>,
): Promise<ScopeOrState> {
  const scope = await getAdminScope(permission);
  if (!scope) return { state: formError('denied', values) };
  if (!scope.writable) return { state: formError('readOnly', values) };
  return { scope };
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_PATTERN.test(value);

/** Field → message-key map of a failed Zod parse (the platform helper, re-exported for the registry actions). */
export { fieldErrors as zodFieldErrors } from '@domus/domain/platform';
