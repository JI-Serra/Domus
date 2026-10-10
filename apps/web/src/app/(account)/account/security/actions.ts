'use server';

import { normalizeTotpCode } from '@domus/domain/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { mapAuthError } from '@/lib/auth/errors';
import { MFA_SETTINGS_PATH, loadVerifiedFactors } from '@/lib/auth/mfa';
import type {
  CodeFormState,
  EnrollmentStart,
  FactorRemoval,
} from '@/lib/auth/mfa-state';
import { safeNextPath } from '@/lib/auth/redirect';
import { readText } from '@/lib/auth/validation';
import { getRequestIdentity } from '@/lib/context/request-context';
import { createRequestClient } from '@/lib/supabase/request-client';

/** Name shown by the authenticator app next to the six digits. */
const ISSUER = 'Domus';

/**
 * Starts a TOTP enrollment: drops any half-finished one (an unverified factor would block a retry), asks the auth
 * server for a new factor and returns what the user needs to add it to their app. The factor only counts once a
 * code from the app is verified (`verifyTotpEnrollmentAction`).
 */
export async function startTotpEnrollmentAction(): Promise<EnrollmentStart> {
  if (!(await getRequestIdentity()))
    return { ok: false, error: 'sessionExpired' };

  const client = await createRequestClient();
  const listed = await client.auth.mfa.listFactors();
  if (listed.error) return { ok: false, error: mapAuthError(listed.error) };
  for (const stale of listed.data.all.filter(
    (factor) => factor.status === 'unverified',
  ))
    await client.auth.mfa.unenroll({ factorId: stale.id });

  // Friendly names are unique per user, so the name carries a short suffix.
  const t = await getTranslations('account.security.factors');
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    issuer: ISSUER,
    friendlyName: `${t('defaultName')} ${Date.now().toString(36)}`,
  });
  if (error) return { ok: false, error: mapAuthError(error) };

  const { qr_code: qr, secret } = data.totp;
  return {
    ok: true,
    factorId: data.id,
    qrCode: qr.startsWith('data:') ? qr : `data:image/svg+xml;utf-8,${qr}`,
    secret,
  };
}

/** Throws away an enrollment the user gave up on. Only unverified factors can be dropped this way. */
export async function cancelTotpEnrollmentAction(
  factorId: string,
): Promise<void> {
  if (!(await getRequestIdentity()) || typeof factorId !== 'string') return;
  const client = await createRequestClient();
  const { data } = await client.auth.mfa.listFactors();
  if (data?.all.some((f) => f.id === factorId && f.status === 'unverified'))
    await client.auth.mfa.unenroll({ factorId });
}

/**
 * Completes the enrollment with a code from the user's app. This also raises the session to `aal2`. When a safe
 * return path came with the request (a platform admin enrolling to reach `/platform`), it continues there.
 */
export async function verifyTotpEnrollmentAction(
  _previous: CodeFormState,
  formData: FormData,
): Promise<CodeFormState> {
  if (!(await getRequestIdentity()))
    return { status: 'error', error: 'sessionExpired', field: 'form' };

  const code = normalizeTotpCode(readText(formData, 'code'));
  if (!code) return { status: 'error', error: 'mfaCodeInvalid', field: 'code' };

  const client = await createRequestClient();
  const { data: listed } = await client.auth.mfa.listFactors();
  const factorId = readText(formData, 'factorId');
  if (!listed?.all.some((f) => f.id === factorId && f.status === 'unverified'))
    return { status: 'error', error: 'mfaNoFactor', field: 'form' };

  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId,
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

  revalidatePath(MFA_SETTINGS_PATH);
  const next = safeNextPath(readText(formData, 'next'), '');
  if (next) redirect(next);
  return { status: 'done' };
}

/**
 * Removes a verified factor. The auth server only allows it at `aal2` (`insufficient_aal`), which is reported as
 * "confirm your identity" so the page can offer the challenge.
 */
export async function removeFactorAction(
  factorId: string,
): Promise<FactorRemoval> {
  if (!(await getRequestIdentity()))
    return { ok: false, error: 'sessionExpired' };
  if (typeof factorId !== 'string') return { ok: false, error: 'mfaNoFactor' };

  const client = await createRequestClient();
  let factors;
  try {
    factors = await loadVerifiedFactors(client);
  } catch {
    return { ok: false, error: 'network' };
  }
  if (!factors.some((factor) => factor.id === factorId))
    return { ok: false, error: 'mfaNoFactor' };

  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) return { ok: false, error: mapAuthError(error) };
  revalidatePath(MFA_SETTINGS_PATH);
  return { ok: true };
}
