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
