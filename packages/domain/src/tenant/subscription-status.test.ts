import { describe, expect, it } from 'vitest';
import {
  isTenantWritable,
  tenantAccessMode,
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

describe('tenant access by subscription status', () => {
  it.each([
    ['pilot', 'full', true],
    ['active', 'full', true],
    ['suspended', 'read_only', false],
    ['cancelled', 'blocked', false],
  ] as const)('%s → %s (writable: %s)', (status, mode, writable) => {
    expect(tenantAccessMode(status)).toBe(mode);
    expect(isTenantWritable(status)).toBe(writable);
  });
});
