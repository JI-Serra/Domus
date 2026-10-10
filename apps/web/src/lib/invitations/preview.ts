import type { MembershipRole } from '@domus/domain/context';
import type { DomusSupabaseClient as Client } from '@domus/supabase/types';

export interface InvitationPreview {
  tenantName: string;
  role: MembershipRole;
}

/**
 * Tenant name and role of the invitation for this token, for the confirmation screen. The database applies the
 * same gate as acceptance and answers every failure the same way, so `null` covers expired, used, revoked, wrong
 * account and unknown tokens alike (no enumeration).
 */
export async function previewInvitation(
  client: Client,
  token: string,
): Promise<InvitationPreview | null> {
  const { data, error } = await client.rpc('preview_invitation', { token });
  if (error) return null;
  const row = data[0];
  return row
    ? { tenantName: row.tenant_name, role: row.invitation_membership_role }
    : null;
}
