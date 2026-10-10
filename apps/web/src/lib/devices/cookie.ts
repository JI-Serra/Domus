/** Name of the httpOnly cookie that keeps a paired tablet's credential (read only by server code, from M13 on). */
export const DEVICE_COOKIE_NAME = 'domus-device';

export interface DeviceCredential {
  tenant_id: string;
  device_id: string;
  /** 256-bit device secret issued once at pairing; the database keeps only its hash. */
  device_token: string;
}

export function encodeDeviceCookie(credential: DeviceCredential): string {
  return Buffer.from(JSON.stringify(credential), 'utf8').toString('base64url');
}

/** The credential in a cookie value, or null when it is missing or malformed. */
export function parseDeviceCookie(
  value: string | undefined,
): DeviceCredential | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );
    const record = parsed as Partial<DeviceCredential> | null;
    return typeof record?.tenant_id === 'string' &&
      typeof record.device_id === 'string' &&
      typeof record.device_token === 'string' &&
      /^[a-f0-9]{64}$/.test(record.device_token)
      ? {
          tenant_id: record.tenant_id,
          device_id: record.device_id,
          device_token: record.device_token,
        }
      : null;
  } catch {
    return null;
  }
}
