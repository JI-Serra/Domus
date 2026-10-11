'use server';

import { gateFormSchema } from '@domus/domain/registry-ui';
import {
  createDevicePairing,
  revokeDevice,
  saveGate,
} from '@domus/supabase/registry';
import { revalidatePath } from 'next/cache';
import { fieldError, formError, textValues } from '@/lib/platform/form-state';
import type { PlatformFormState } from '@/lib/platform/form-state';
import { isUuid, writableScope, zodFieldErrors } from '@/lib/registry/action';
import { registryErrorKey } from '@/lib/registry/errors';

const GATES_PATH = '/registry/gates';
const GATE_FIELDS = ['gate_name', 'gate_kind', 'client_event_id'] as const;

/** Creates a gate, or edits the one in `gateId` (name, kind, active). */
export async function saveGateAction(
  gateId: string | null,
  _previous: PlatformFormState,
  formData: FormData,
): Promise<PlatformFormState> {
  const values = textValues(formData, GATE_FIELDS);
  if (formData.get('gate_is_active')) values.gate_is_active = 'on';
  const checked = await writableScope('guards', values);
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if ((gateId !== null && !isUuid(gateId)) || !isUuid(values.client_event_id))
    return formError('unknown', values);
  const parsed = gateFormSchema.safeParse(values);
  if (!parsed.success) return fieldError(zodFieldErrors(parsed.error), values);
  const { error } = await saveGate(scope.client, {
    target_tenant_id: scope.tenantId,
    client_event_id: values.client_event_id,
    gate_data: { ...(gateId ? { gate_id: gateId } : {}), ...parsed.data },
  });
  if (error) return formError(registryErrorKey(error, 'gate.save'), values);
  revalidatePath(GATES_PATH);
  return { status: 'success', notice: gateId ? 'gateSaved' : 'gateCreated' };
}

/**
 * Generates a ten-minute pairing code for a gate. The code is in the answer once (the database stores only its hash);
 * `value` carries it with its expiry, as JSON, for the one screen that shows it.
 */
export async function createPairingAction(
  gateId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('guards');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(gateId)) return formError('denied');
  const { data, error } = await createDevicePairing(scope.client, {
    target_tenant_id: scope.tenantId,
    target_gate_id: gateId,
    client_event_id: crypto.randomUUID(),
  });
  const row = data?.[0];
  if (error || !row) {
    if (error) return formError(registryErrorKey(error, 'device.pair'));
    return formError('unknown');
  }
  return {
    status: 'success',
    notice: 'pairingCreated',
    value: JSON.stringify({
      code: row.pairing_code,
      expiresAt: row.expires_at,
    }),
  };
}

/** Revokes a device: its next sync fails at once. */
export async function revokeDeviceAction(
  deviceId: string,
): Promise<PlatformFormState> {
  const checked = await writableScope('guards');
  if ('state' in checked) return checked.state;
  const { scope } = checked;
  if (!isUuid(deviceId)) return formError('denied');
  const { error } = await revokeDevice(scope.client, {
    target_tenant_id: scope.tenantId,
    target_device_id: deviceId,
    client_event_id: crypto.randomUUID(),
  });
  if (error) return formError(registryErrorKey(error, 'device.revoke'));
  revalidatePath(GATES_PATH);
  return { status: 'success', notice: 'deviceRevoked' };
}
