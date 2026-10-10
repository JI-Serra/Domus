import { z } from 'zod';

export const SUPPORT_DEFAULT_MINUTES = 30;
export const SUPPORT_MAX_MINUTES = 60;
export const SUPPORT_REASON_MAX_LENGTH = 500;
/** Largest page of target users the database lookup returns. */
export const SUPPORT_TARGETS_LIMIT = 50;

export const supportSessionStatuses = [
  'active',
  'ended',
  'revoked',
  'expired',
] as const;
export type SupportSessionStatus = (typeof supportSessionStatuses)[number];

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Form of M01-F04: whom to support and why. Messages are keys under `platform.support.errors`. */
export const supportStartFormSchema = z.object({
  target_tenant_id: uuid.catch('').refine((v) => v !== '', 'tenantRequired'),
  target_user_id: uuid.catch('').refine((v) => v !== '', 'userRequired'),
  reason: z
    .string()
    .trim()
    .min(1, 'reasonRequired')
    .max(SUPPORT_REASON_MAX_LENGTH, 'reasonTooLong'),
  duration_minutes: z.coerce
    .number('durationInvalid')
    .int('durationInvalid')
    .min(1, 'durationInvalid')
    .max(SUPPORT_MAX_MINUTES, 'durationInvalid')
    .default(SUPPORT_DEFAULT_MINUTES),
});
export type SupportStartValues = z.output<typeof supportStartFormSchema>;

/** Whole seconds left until `expiresAt`, never negative. */
export function supportRemainingSeconds(
  expiresAt: string | number | Date,
  now: Date,
): number {
  const remaining = Math.ceil(
    (new Date(expiresAt).getTime() - now.getTime()) / 1000,
  );
  return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
}

/** `mm:ss` for the banner countdown; minutes keep counting past 59 so the value never wraps. */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** An `active` row past its expiry is shown as `expired`, whatever the database has not yet recorded. */
export function supportDisplayStatus(
  session: {
    support_session_status: SupportSessionStatus;
    support_session_expires_at: string;
  },
  now: Date,
): SupportSessionStatus {
  if (
    session.support_session_status === 'active' &&
    new Date(session.support_session_expires_at).getTime() <= now.getTime()
  )
    return 'expired';
  return session.support_session_status;
}

/** Minutes the session actually lasted: until it ended, or until its expiry while it was left to run out. */
export function supportActualMinutes(session: {
  support_session_started_at: string;
  support_session_ended_at: string | null;
  support_session_expires_at: string;
}): number {
  const end = new Date(
    session.support_session_ended_at ?? session.support_session_expires_at,
  ).getTime();
  const start = new Date(session.support_session_started_at).getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}

/** Claims of a support token that the web app needs; the database verifies the token on every request. */
export interface SupportTokenClaims {
  sub: string;
  support_session_id: string;
  support_tenant_id: string;
  exp: number;
}

/**
 * Reads the claims of a support JWT WITHOUT verifying its signature. That is safe only because the result is used
 * for display and for choosing which client to build: every database call re-verifies the token, so a forged or
 * stale token gets no data. Returns null for anything malformed or already expired.
 */
export function readSupportTokenClaims(
  token: string,
  now: Date,
): SupportTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
    );
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== 'object' || claims === null) return null;
    const record = claims as Record<string, unknown>;
    const { sub, support_session_id, support_tenant_id, exp } = record;
    if (
      typeof sub !== 'string' ||
      typeof support_session_id !== 'string' ||
      typeof support_tenant_id !== 'string' ||
      typeof exp !== 'number' ||
      !Number.isFinite(exp)
    )
      return null;
    if (exp * 1000 <= now.getTime()) return null;
    return { sub, support_session_id, support_tenant_id, exp };
  } catch {
    return null;
  }
}
