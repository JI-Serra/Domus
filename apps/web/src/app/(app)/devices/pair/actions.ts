'use server';

import { devicePairingSchema } from '@domus/domain/registry-ui';
import { redeemDevicePairing } from '@domus/supabase/registry';
import { cookies } from 'next/headers';
import { canPairDevices } from '@/lib/devices/access';
import { DEVICE_COOKIE_NAME, encodeDeviceCookie } from '@/lib/devices/cookie';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { isUuid, zodFieldErrors } from '@/lib/registry/action';
import { registryErrorKey } from '@/lib/registry/errors';
import { createRequestClient } from '@/lib/supabase/request-client';

const FIELDS = ['device_name', 'pairing_code'] as const;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Redeems a pairing code on the tablet itself. The database answers one uniform "unavailable" for a wrong, expired,
 * used or throttled code, and that is all the screen says. On success the device credential (issued once) goes into
 * an httpOnly cookie that only server code can read: the page, its props and the browser's scripts never see it.
 */
export async function redeemPairingAction(
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, FIELDS);
  const tenantId = await canPairDevices();
  if (!tenantId) return formError('denied', values);
  const parsed = devicePairingSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);

  const client = await createRequestClient();
  const { data, error } = await redeemDevicePairing(client, {
    target_tenant_id: tenantId,
    pairing_code: parsed.data.pairing_code,
    device_name: parsed.data.device_name,
  });
  if (error) return formError(registryErrorKey(error, 'device.redeem'), values);
  const result = data as {
    status?: string;
    device_id?: string;
    device_token?: string;
  } | null;
  if (
    result?.status !== 'paired' ||
    !isUuid(result.device_id) ||
    typeof result.device_token !== 'string'
  )
    return formError('pairingUnavailable', values);

  (await cookies()).set(
    DEVICE_COOKIE_NAME,
    encodeDeviceCookie({
      tenant_id: tenantId,
      device_id: result.device_id,
      device_token: result.device_token,
    }),
    {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
    },
  );
  return {
    status: 'success',
    notice: 'paired',
    value: parsed.data.device_name,
  };
}
