'use server';

import { normalizeTotpCode } from '@domus/domain/auth';
import { redirect } from 'next/navigation';
import { mapAuthError } from '@/lib/auth/errors';
import { loadVerifiedFactors } from '@/lib/auth/mfa';
import type { CodeFormState } from '@/lib/auth/mfa-state';
import { safeNextPath } from '@/lib/auth/redirect';
import { readText } from '@/lib/auth/validation';
import { getRequestIdentity } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

/**
 * Answers the second factor of a signed-in (aal1) session. The factor id comes from the form, but is only used if
 * it is one of the user's own verified factors; the code is checked by the auth server. On success the session is
 * upgraded to `aal2` (the new cookies are written by the client) and the user continues to the return path.
 */
export async function verifyMfaChallengeAction(
  _previous: CodeFormState,
  formData: FormData,
): Promise<CodeFormState> {
  if (!(await getRequestIdentity()))
    return { status: 'error', error: 'sessionExpired', field: 'form' };

  const code = normalizeTotpCode(readText(formData, 'code'));
  if (!code) return { status: 'error', error: 'mfaCodeInvalid', field: 'code' };

  const client = await createRequestClient();
  let factors;
  try {
    factors = await loadVerifiedFactors(client);
  } catch {
    return { status: 'error', error: 'network', field: 'form' };
  }
  const requested = readText(formData, 'factorId');
  const factor = factors.find((candidate) => candidate.id === requested);
  if (!factor) return { status: 'error', error: 'mfaNoFactor', field: 'form' };

  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  if (error) {
    const key = mapAuthError(error);
    return {
      status: 'error',
      error: key,
      field: key === 'mfaWrongCode' ? 'code' : 'form',
    };
  }
  redirect(safeNextPath(readText(formData, 'next')));
}
