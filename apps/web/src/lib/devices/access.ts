import { getRequestContext } from '@/lib/context/request-context';
import { getAdminPermissions } from '@/lib/registry/permissions';

/**
 * Tenant id when the current user may pair a tablet: a guard of the barrio, or an administrator who manages guards
 * and gates. Never during a support session. Null for everybody else.
 */
export async function canPairDevices(): Promise<string | null> {
  const request = await getRequestContext();
  const active = request?.resolved.active;
  if (!active?.tenant_id || request?.support) return null;
  if (active.membership_role === 'guard') return active.tenant_id;
  if (
    active.membership_role === 'tenant_admin' &&
    (await getAdminPermissions()).includes('guards')
  )
    return active.tenant_id;
  return null;
}
