import { adminPermissionSchema } from '@domus/domain/platform';
import type { AdminPermission } from '@domus/domain/registry-ui';
import { cache } from 'react';
import { getRequestContext } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

export type { AdminPermission };

/**
 * The administrative permissions of the active `tenant_admin` membership, read through the user's own RLS client
 * (a member can always read their own permission rows). Empty for every other role. Memoized per request.
 *
 * This decides what the interface offers and which pages open; the database independently authorizes every read
 * and write (`permission_tenant_ids(...)` in the policies, `require_registry` / guards checks in the RPCs).
 */
export const getAdminPermissions = cache(
  async (): Promise<readonly AdminPermission[]> => {
    const request = await getRequestContext();
    const active = request?.resolved.active;
    if (!active || active.membership_role !== 'tenant_admin') return [];
    const { data, error } = await (
      await createRequestClient()
    )
      .from('membership_permission')
      .select('membership_permission_admin_permission')
      .eq('membership_id', active.membership_id);
    if (error) throw new Error(`Could not load permissions (${error.code})`);
    return data.flatMap((row) => {
      const parsed = adminPermissionSchema.safeParse(
        row.membership_permission_admin_permission,
      );
      return parsed.success ? [parsed.data] : [];
    });
  },
);
