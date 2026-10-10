'use server';

import {
  fieldErrors,
  readSupportTokenClaims,
  supportStartFormSchema,
} from '@domus/domain/platform';
import type { MembershipRole } from '@domus/domain/context';
import { reportError } from '@domus/observability';
import {
  endSupportSession,
  startSupportSession,
} from '@domus/supabase/platform';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSiteUrl } from '@/lib/auth/site-url';
import { functionErrorCode } from '@/lib/platform/function-errors';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { getPlatformClient } from '@/lib/platform/guard';
import {
  SUPPORT_COOKIE_NAME,
  supportCookieOptions,
} from '@/lib/support/session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SupportTarget {
  user_id: string;
  person_first_name: string;
  person_last_name: string;
  membership_role: MembershipRole;
}

export type SupportTargetsResult =
  | { ok: true; targets: SupportTarget[] }
  | { ok: false; error: 'lookupFailed' | 'denied' };

/**
 * The people of a barrio the admin may act as (active members only, names and role only; at most 50). Every call is
 * audited by the database with the size of the search text, never the text itself.
 */
export async function lookupSupportTargetsAction(
  tenantId: string,
  search: string,
): Promise<SupportTargetsResult> {
  const client = await getPlatformClient();
  if (!client || !UUID.test(tenantId)) return { ok: false, error: 'denied' };
  const { data, error } = await client.rpc('list_support_targets', {
    target_tenant_id: tenantId,
    search:
      typeof search === 'string' && search.trim() ? search.trim() : undefined,
  });
  if (error) {
    if (error.code === '42501') return { ok: false, error: 'denied' };
    reportError(new Error(`Support target lookup failed (${error.code})`), {
      operation: 'support.lookup',
    });
    return { ok: false, error: 'lookupFailed' };
  }
  return { ok: true, targets: data };
}

const START_FIELDS = [
  'target_tenant_id',
  'target_user_id',
  'reason',
  'duration_minutes',
  'client_event_id',
] as const;

/**
 * Starts a support session (M01-F04, D18): asks the `support-session` function for the target's token and keeps it
 * in an httpOnly cookie, so the browser then shows Domus as that user. The token is never returned to the page.
 */
export async function startSupportAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, START_FIELDS);
  const client = await getPlatformClient();
  if (!client) return formError('denied', values);

  const parsed = supportStartFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(fieldErrors(parsed.error), values);
  if (!UUID.test(values.client_event_id ?? ''))
    return formError('unknown', values);

  const { data, error } = await startSupportSession(client, {
    target_tenant_id: parsed.data.target_tenant_id,
    target_user_id: parsed.data.target_user_id,
    reason: parsed.data.reason,
    duration_minutes: parsed.data.duration_minutes,
    client_event_id: values.client_event_id ?? '',
  });
  if (error || !data) {
    const code = error ? await functionErrorCode(error) : 'unknown';
    if (code === 'session_already_active')
      return formError('sessionActive', values);
    if (code === 'forbidden' || code === 'unauthorized')
      return formError('denied', values);
    if (code === 'service_unavailable') return formError('unavailable', values);
    if (code === 'invalid_input') return formError('invalid', values);
    reportError(new Error(`Support start failed (${code})`), {
      operation: 'support.start',
    });
    return formError('unknown', values);
  }

  const claims = readSupportTokenClaims(data.access_token, new Date());
  if (!claims) {
    // A token we cannot use: close the session we just opened instead of leaving it running unseen.
    await endSupportSession(client, data.support_session_id);
    reportError(new Error('Unusable support token'), {
      operation: 'support.start',
    });
    return formError('unknown', values);
  }

  (await cookies()).set(
    SUPPORT_COOKIE_NAME,
    data.access_token,
    supportCookieOptions(
      claims.exp,
      (await getSiteUrl()).startsWith('https://'),
    ),
  );
  redirect('/');
}

/** Ends one of the admin's own active sessions that has no cookie in this browser (started elsewhere). */
export async function endOwnSupportSessionAction(
  sessionId: string,
): Promise<PlatformFormState> {
  const client = await getPlatformClient();
  if (!client || !UUID.test(sessionId)) return formError('denied');
  const { error } = await endSupportSession(client, sessionId);
  if (error) {
    if (error.code !== '42501')
      reportError(new Error(`Support end failed (${error.code})`), {
        operation: 'support.end',
      });
    return formError(error.code === '42501' ? 'denied' : 'unknown');
  }
  revalidatePath('/platform/support');
  return { status: 'success' };
}
