'use server';

import { endSupportSession } from '@domus/supabase/platform';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { reportError } from '@domus/observability';
import {
  createActorRequestClient,
  createRequestClient,
} from '@/lib/supabase/request-client';
import { SUPPORT_COOKIE_NAME, parseSupportCookie } from './session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ends the support session ("Terminar" in the banner, and the automatic exit at expiry) and drops the support cookie,
 * which hands the browser back to the platform admin's own session untouched.
 *
 * The session is closed with the admin's own client (an `aal2` token the database accepts from the actor); if that is
 * not possible the support token itself may close its own session. The cookie is cleared either way: an expired
 * session needs no closing, and nothing here can leave the browser stuck acting as somebody else.
 */
export async function endSupportAction(sessionId?: string): Promise<void> {
  const store = await cookies();
  const support = parseSupportCookie(store.get(SUPPORT_COOKIE_NAME)?.value);
  // The cookie is authoritative while it is live; a session id passed by the banner covers the instant after it expired.
  const id =
    support?.claims.support_session_id ??
    (sessionId && UUID.test(sessionId) ? sessionId : null);

  if (id) {
    let ended = false;
    try {
      const { error } = await endSupportSession(
        await createActorRequestClient(),
        id,
      );
      ended = !error;
    } catch (error) {
      reportError(error, { operation: 'support.end.actor' });
    }
    if (!ended && support) {
      try {
        await endSupportSession(await createRequestClient(), id);
      } catch (error) {
        reportError(error, { operation: 'support.end.support' });
      }
    }
  }

  store.delete(SUPPORT_COOKIE_NAME);
  redirect('/platform/support');
}
