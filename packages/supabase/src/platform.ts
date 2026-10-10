import type { Database } from './database.types';
import type { DomusSupabaseClient } from './types';
import { createClient } from '@supabase/supabase-js';

/** An ephemeral target client; the actor's normal auth session stays separate. */
export const createSupportClient = (
  url: string,
  publishableKey: string,
  accessToken: string,
): DomusSupabaseClient =>
  createClient<Database>(url, publishableKey, {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false },
  });

type Args<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Args'];

export const createTenant = (
  client: DomusSupabaseClient,
  input: Args<'create_tenant'>,
) => client.rpc('create_tenant', input);
export const acceptInvitation = (client: DomusSupabaseClient, token: string) =>
  client.rpc('accept_invitation', { token });
export const revokeInvitation = (
  client: DomusSupabaseClient,
  target_invitation_id: string,
) => client.rpc('revoke_invitation', { target_invitation_id });
export const endSupportSession = (
  client: DomusSupabaseClient,
  target_support_session_id: string,
) => client.rpc('end_support_session', { target_support_session_id });
export const currentUserIsPlatformAdmin = (client: DomusSupabaseClient) =>
  client.rpc('current_user_is_platform_admin');

export type SendInvitationInput = Omit<
  Args<'create_invitation'>,
  'token_hash' | 'expires_at'
>;
export type SupportSessionToken = {
  access_token: string;
  expires_at: string;
  support_session_id: string;
  tenant_id: string;
  target_user_id: string;
};
export const sendInvitation = (
  client: DomusSupabaseClient,
  input: SendInvitationInput,
) =>
  client.functions.invoke<{ invitation_id: string }>('send-invitation', {
    body: input,
  });
export const startSupportSession = (
  client: DomusSupabaseClient,
  input: Args<'start_support_session'>,
) =>
  client.functions.invoke<SupportSessionToken>('support-session', {
    body: { action: 'start', ...input },
  });
