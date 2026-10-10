import type { DomusSupabaseClient } from '@domus/supabase/types';
import { notFound } from 'next/navigation';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';
import { getTenantWritable } from '@/lib/tenant/status';
import { getAdminPermissions } from './permissions';
import type { AdminPermission } from './permissions';

export interface AdminScope {
  client: DomusSupabaseClient;
  tenantId: string;
  membershipId: string;
  /** False while the barrio is suspended or cancelled: reads are fine, writes are not (M01-F02). */
  writable: boolean;
}

/**
 * The scope of the active tenant administrator when they hold at least one of `permissions`, else null. Cheap early
 * refusal for pages and Server Actions; the database is the control (RLS and the RPCs' own checks).
 */
export async function getAdminScope(
  ...permissions: readonly AdminPermission[]
): Promise<AdminScope | null> {
  const request = await getRequestContext();
  const active = request?.resolved.active;
  if (!active?.tenant_id || active.membership_role !== 'tenant_admin')
    return null;
  const held = await getAdminPermissions();
  if (!permissions.some((permission) => held.includes(permission))) return null;
  return {
    client: await createRequestClient(),
    tenantId: active.tenant_id,
    membershipId: active.membership_id,
    writable: await getTenantWritable(),
  };
}

/** For pages: the scope, or the same 404 a stranger gets (the area is not confirmed to exist). */
export async function requireAdminScope(
  ...permissions: readonly AdminPermission[]
): Promise<AdminScope> {
  const scope = await getAdminScope(...permissions);
  if (!scope) notFound();
  return scope;
}

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
