import {
  accessPolicyBounds,
  householdAccessModes,
  visitorTypes,
} from '@domus/domain/access-policy';
import type {
  AccessPolicy,
  AccessPolicyRule,
  HouseholdAccessMode,
  PolicyChange,
  VisitorType,
} from '@domus/domain/access-policy';

export { householdAccessModes, visitorTypes };

export type LimitKey = keyof typeof accessPolicyBounds;
export const limitKeys = Object.keys(accessPolicyBounds) as LimitKey[];

/** Short message id of each numeric limit (`accessPolicy.limits.<id>`). */
export const LIMIT_IDS = {
  access_policy_approval_timeout_seconds_count: 'timeout',
  access_policy_permanent_authorization_max_days_count: 'permanentDays',
  access_policy_pass_max_uses_count: 'passUses',
  access_policy_pass_max_days_count: 'passDays',
  access_policy_event_max_guests_count: 'eventGuests',
} as const satisfies Record<LimitKey, string>;
export type LimitId = (typeof LIMIT_IDS)[LimitKey];

const LIMIT_VALUE_UNITS = {
  timeout: 'seconds',
  permanentDays: 'days',
  passUses: 'uses',
  passDays: 'days',
  eventGuests: 'guests',
} as const satisfies Record<LimitId, string>;
export const limitValueUnit = (key: LimitKey) =>
  LIMIT_VALUE_UNITS[LIMIT_IDS[key]];

/**
 * An unknown visitor only admits approval or rejection (P2/P3, domain rule `unknown_requires_approval_or_reject`).
 * The unit test checks this against `validatePolicy`, so the two cannot drift apart.
 */
export function isModeSelectable(
  visitor: VisitorType,
  mode: HouseholdAccessMode,
): boolean {
  return visitor !== 'unknown' || mode === 'approval' || mode === 'reject';
}

/** A rule must keep at least one allowed mode: the last one cannot be switched off. */
export function canClearMode(
  rule: AccessPolicyRule,
  mode: HouseholdAccessMode,
): boolean {
  const allowed = rule.access_policy_rule_allowed_modes;
  return !allowed.includes(mode) || allowed.length > 1;
}

/**
 * The rule after switching `mode` on or off. Allowed modes keep their canonical order, a default that is no longer
 * allowed falls back to the first allowed mode, and a change the hard rules forbid returns the rule unchanged.
 */
export function toggleMode(
  rule: AccessPolicyRule,
  visitor: VisitorType,
  mode: HouseholdAccessMode,
  checked: boolean,
): AccessPolicyRule {
  if (checked && !isModeSelectable(visitor, mode)) return rule;
  if (!checked && !canClearMode(rule, mode)) return rule;
  const allowed = householdAccessModes.filter((candidate) =>
    candidate === mode
      ? checked
      : rule.access_policy_rule_allowed_modes.includes(candidate),
  );
  const [first] = allowed;
  if (!first) return rule;
  return {
    ...rule,
    access_policy_rule_allowed_modes: allowed,
    access_policy_rule_default_mode: allowed.includes(
      rule.access_policy_rule_default_mode,
    )
      ? rule.access_policy_rule_default_mode
      : first,
  };
}

export function setDefaultMode(
  rule: AccessPolicyRule,
  mode: HouseholdAccessMode,
): AccessPolicyRule {
  return rule.access_policy_rule_allowed_modes.includes(mode)
    ? { ...rule, access_policy_rule_default_mode: mode }
    : rule;
}

export function setIdentityRequired(
  rule: AccessPolicyRule,
  required: boolean,
): AccessPolicyRule {
  return {
    ...rule,
    access_policy_rule_is_identity_verification_required: required,
  };
}

/** What a limit field holds as text, to let the person type freely before the value counts. */
export type LimitInputs = Record<LimitKey, string>;

export const limitInputsOf = (policy: AccessPolicy): LimitInputs =>
  Object.fromEntries(
    limitKeys.map((key) => [key, String(policy[key])]),
  ) as LimitInputs;

/** The typed text as a number; anything that is not a whole number reads as `NaN`, which the domain rejects. */
export const parseLimitInput = (text: string): number =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN;

export function isLimitInRange(key: LimitKey, value: number): boolean {
  const [min, max] = accessPolicyBounds[key];
  return Number.isInteger(value) && value >= min && value <= max;
}

/** The draft policy with the typed limits applied (invalid text becomes `NaN`, so the domain validator refuses it). */
export function withLimitInputs(
  policy: AccessPolicy,
  inputs: LimitInputs,
): AccessPolicy {
  const next = { ...policy };
  for (const key of limitKeys) next[key] = parseLimitInput(inputs[key]);
  return next;
}

export type ChangeTarget =
  | { kind: 'limit'; key: LimitKey }
  | {
      kind: 'rule';
      visitor: VisitorType;
      field: 'allowedModes' | 'defaultMode' | 'identity';
    };

const RULE_FIELDS = {
  access_policy_rule_allowed_modes: 'allowedModes',
  access_policy_rule_default_mode: 'defaultMode',
  access_policy_rule_is_identity_verification_required: 'identity',
} as const;

/** Reads a `diffPolicy` path (`rules.delivery.access_policy_rule_default_mode`, a limit column) into what it names. */
export function parseChangePath(path: string): ChangeTarget | null {
  if ((limitKeys as string[]).includes(path))
    return { kind: 'limit', key: path as LimitKey };
  const [root, visitor, column] = path.split('.');
  if (
    root === 'rules' &&
    visitor &&
    column &&
    (visitorTypes as readonly string[]).includes(visitor) &&
    column in RULE_FIELDS
  )
    return {
      kind: 'rule',
      visitor: visitor as VisitorType,
      field: RULE_FIELDS[column as keyof typeof RULE_FIELDS],
    };
  return null;
}

export type { PolicyChange };
