'use server';

import { CONTEXT_COOKIE_NAME } from '@domus/domain/context';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getRequestContext } from '@/lib/context/request-context';
import { getSiteUrl } from '@/lib/auth/site-url';
import { createRequestClient } from '@/lib/supabase/request-client';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Switches the active context. The requested id is only accepted if it is one of the options the server computes
 * from the signed-in user's active memberships right now; anything else is ignored and the default stays.
 * Returns whether the switch was applied.
 */
export async function switchContextAction(
  membershipId: string,
): Promise<{ applied: boolean }> {
  const request = await getRequestContext();
  if (
    !request ||
    typeof membershipId !== 'string' ||
    !request.resolved.options.some(
      (option) => option.membership_id === membershipId,
    )
  )
    return { applied: false };

  (await cookies()).set(CONTEXT_COOKIE_NAME, membershipId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: (await getSiteUrl()).startsWith('https://'),
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
  });
  return { applied: true };
}

/** Ends this device's session and forgets the chosen context. */
export async function signOutAction(): Promise<void> {
  const client = await createRequestClient();
  await client.auth.signOut({ scope: 'local' });
  (await cookies()).delete(CONTEXT_COOKIE_NAME);
  redirect('/login');
}
