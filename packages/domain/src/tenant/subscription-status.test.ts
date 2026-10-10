import { describe, expect, it } from 'vitest';
import {
  tenantSubscriptionStatuses,
  tenantSubscriptionStatusSchema,
} from './subscription-status';

describe('tenant subscription status', () => {
  it('exports the four glossary statuses in order', () => {
    expect(tenantSubscriptionStatuses).toEqual([
      'pilot',
      'active',
      'suspended',
      'cancelled',
    ]);
  });
  it.each(tenantSubscriptionStatuses)('accepts %s', (status) => {
    expect(tenantSubscriptionStatusSchema.parse(status)).toBe(status);
  });
  it.each(['piloto', 'unknown', '', null, undefined, 1])(
    'rejects invalid value %s',
    (status) => {
      expect(tenantSubscriptionStatusSchema.safeParse(status).success).toBe(
        false,
      );
    },
  );
});
