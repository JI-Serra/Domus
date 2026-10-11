import { z } from 'zod';

export const visitorTypes = [
  'permanent_authorized',
  'recurring_authorized',
  'pass_guest',
  'event_guest',
  'delivery',
  'service_worker',
  'unknown',
] as const;
export const householdAccessModes = [
  'direct_entry',
  'notify',
  'approval',
  'reject',
] as const;
export const accessPolicyTemplates = [
  'balanced',
  'strict',
  'flexible',
] as const;
export const visitorTypeSchema = z.enum(visitorTypes);
export const householdAccessModeSchema = z.enum(householdAccessModes);
export const accessPolicyTemplateSchema = z.enum(accessPolicyTemplates);
export const accessPolicyBounds = {
  access_policy_approval_timeout_seconds_count: [30, 300],
  access_policy_permanent_authorization_max_days_count: [1, 3650],
  access_policy_pass_max_uses_count: [1, 100],
  access_policy_pass_max_days_count: [1, 365],
  access_policy_event_max_guests_count: [1, 1000],
} as const;
const bounded = (range: readonly [number, number]) =>
  z.number().int().min(range[0]).max(range[1]);
export const accessPolicyRuleSchema = z
  .strictObject({
    access_policy_rule_allowed_modes: z
      .array(householdAccessModeSchema)
      .min(1)
      .max(4),
    access_policy_rule_default_mode: householdAccessModeSchema,
    access_policy_rule_is_identity_verification_required: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    if (
      new Set(rule.access_policy_rule_allowed_modes).size !==
      rule.access_policy_rule_allowed_modes.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['access_policy_rule_allowed_modes'],
        message: 'duplicate_modes',
      });
    if (
      !rule.access_policy_rule_allowed_modes.includes(
        rule.access_policy_rule_default_mode,
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['access_policy_rule_default_mode'],
        message: 'default_not_allowed',
      });
  });
export const accessPolicySchema = z
  .strictObject({
    access_policy_approval_timeout_seconds_count: bounded(
      accessPolicyBounds.access_policy_approval_timeout_seconds_count,
    ),
    access_policy_permanent_authorization_max_days_count: bounded(
      accessPolicyBounds.access_policy_permanent_authorization_max_days_count,
    ),
    access_policy_pass_max_uses_count: bounded(
      accessPolicyBounds.access_policy_pass_max_uses_count,
    ),
    access_policy_pass_max_days_count: bounded(
      accessPolicyBounds.access_policy_pass_max_days_count,
    ),
    access_policy_event_max_guests_count: bounded(
      accessPolicyBounds.access_policy_event_max_guests_count,
    ),
    rules: z.record(visitorTypeSchema, accessPolicyRuleSchema),
  })
  .superRefine((policy, ctx) => {
    if (
      policy.rules.unknown.access_policy_rule_allowed_modes.some(
        (mode) => mode === 'direct_entry' || mode === 'notify',
      )
    )
      ctx.addIssue({
        code: 'custom',
        path: ['rules', 'unknown', 'access_policy_rule_allowed_modes'],
        message: 'unknown_requires_approval_or_reject',
      });
  });
export type VisitorType = z.infer<typeof visitorTypeSchema>;
export type HouseholdAccessMode = z.infer<typeof householdAccessModeSchema>;
export type AccessPolicyTemplate = z.infer<typeof accessPolicyTemplateSchema>;
export type AccessPolicy = z.infer<typeof accessPolicySchema>;
export type AccessPolicyRule = z.infer<typeof accessPolicyRuleSchema>;
export const validatePolicy = (input: unknown) =>
  accessPolicySchema.safeParse(input);

export interface PolicyChange {
  path: string;
  before: number | boolean | string | string[];
  after: number | boolean | string | string[];
}
/** Mode arrays are sets: reordering them does not change the effective policy. */
export function diffPolicy(
  before: AccessPolicy,
  after: AccessPolicy,
): PolicyChange[] {
  const changes: PolicyChange[] = [];
  for (const key of Object.keys(
    accessPolicyBounds,
  ) as (keyof typeof accessPolicyBounds)[]) {
    if (before[key] !== after[key])
      changes.push({ path: key, before: before[key], after: after[key] });
  }
  for (const type of visitorTypes) {
    const a = before.rules[type];
    const b = after.rules[type];
    for (const key of Object.keys(a) as (keyof AccessPolicyRule)[]) {
      const oldValue = a[key];
      const newValue = b[key];
      const same =
        Array.isArray(oldValue) && Array.isArray(newValue)
          ? JSON.stringify([...oldValue].sort()) ===
            JSON.stringify([...newValue].sort())
          : oldValue === newValue;
      if (!same)
        changes.push({
          path: `rules.${type}.${key}`,
          before: oldValue,
          after: newValue,
        });
    }
  }
  return changes;
}
