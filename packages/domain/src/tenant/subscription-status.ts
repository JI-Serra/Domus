import { z } from 'zod';

export const tenantSubscriptionStatuses = [
  'pilot',
  'active',
  'suspended',
  'cancelled',
] as const;
export const tenantSubscriptionStatusSchema = z.enum(
  tenantSubscriptionStatuses,
);
export type TenantSubscriptionStatus = z.infer<
  typeof tenantSubscriptionStatusSchema
>;

/**
 * What a user of the tenant can do under its subscription (M01-F02): `full` (pilot, active), `read_only` (suspended:
 * they see everything and the guard keeps validating accesses, but nothing can be written) or `blocked` (cancelled).
 */
export type TenantAccessMode = 'full' | 'read_only' | 'blocked';

export function tenantAccessMode(
  status: TenantSubscriptionStatus,
): TenantAccessMode {
  switch (status) {
    case 'pilot':
    case 'active':
      return 'full';
    case 'suspended':
      return 'read_only';
    case 'cancelled':
      return 'blocked';
  }
}

/** True when write actions are enabled for the tenant. Later modules gate their mutations on this. */
export function isTenantWritable(status: TenantSubscriptionStatus): boolean {
  return tenantAccessMode(status) === 'full';
}
