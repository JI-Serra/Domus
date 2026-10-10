import type { DomusSupabaseClient as Client } from '@domus/supabase/types';
import { cache } from 'react';
import { getSupportSession } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

/** What the support banner shows. Contains no token: it is rendered into the page. */
export interface SupportBannerData {
  sessionId: string;
  /** "First Last" of the user being supported; empty when the database does not let the target read it. */
  targetName: string;
  tenantName: string;
  /** ISO instant at which the session (and the token) stops working. */
  expiresAt: string;
  /** Server time at render, so the first client render matches the server's. */
  serverNow: string;
}

export async function loadSupportBanner(
  client: Client,
  claims: {
    sub: string;
    support_tenant_id: string;
    support_session_id: string;
    exp: number;
  },
  now: Date,
): Promise<SupportBannerData> {
  // Both reads run as the target user, under RLS: their own person row and the tenant they belong to.
  const [person, tenant] = await Promise.all([
    client
      .from('person')
      .select('person_first_name, person_last_name')
      .eq('tenant_id', claims.support_tenant_id)
      .eq('user_id', claims.sub)
      .maybeSingle(),
    client
      .from('tenant')
      .select('tenant_name')
      .eq('tenant_id', claims.support_tenant_id)
      .maybeSingle(),
  ]);
  const targetName = person.data
    ? `${person.data.person_first_name} ${person.data.person_last_name}`.trim()
    : '';
  return {
    sessionId: claims.support_session_id,
    targetName,
    tenantName: tenant.data?.tenant_name ?? '',
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    serverNow: now.toISOString(),
  };
}

/** Banner data of the current request, or null when nobody is being impersonated. Memoized per request. */
export const getSupportBanner = cache(
  async (): Promise<SupportBannerData | null> => {
    const support = await getSupportSession();
    if (!support) return null;
    return loadSupportBanner(
      await createRequestClient(),
      support.claims,
      new Date(),
    );
  },
);
