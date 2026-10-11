import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accessPolicyBounds,
  accessPolicySchema,
  diffPolicy,
  householdAccessModes,
  policyTemplates,
  validatePolicy,
  visitorTypes,
} from './index';

const clone = () => structuredClone(policyTemplates.balanced);
describe('access policy hard rules', () => {
  it.each(Object.entries(policyTemplates))(
    'validates the complete %s template',
    (_, policy) => {
      expect(accessPolicySchema.parse(policy)).toEqual(policy);
      expect(Object.keys(policy.rules)).toEqual([...visitorTypes]);
    },
  );
  it.each(Object.entries(accessPolicyBounds))(
    'bounds integer %s',
    (key, [min, max]) => {
      for (const value of [min, max])
        expect(validatePolicy({ ...clone(), [key]: value }).success).toBe(true);
      for (const value of [
        min - 1,
        max + 1,
        min + 0.5,
        null,
        '1',
        Infinity,
        NaN,
      ])
        expect(validatePolicy({ ...clone(), [key]: value }).success).toBe(
          false,
        );
    },
  );
  it.each(['direct_entry', 'notify'] as const)(
    'forbids %s for unknown visitors',
    (mode) => {
      const policy = clone();
      policy.rules.unknown.access_policy_rule_allowed_modes.push(mode);
      expect(validatePolicy(policy).success).toBe(false);
    },
  );
  it('allows unknown rejection as the only mode', () => {
    const policy = clone();
    policy.rules.unknown.access_policy_rule_allowed_modes = ['reject'];
    policy.rules.unknown.access_policy_rule_default_mode = 'reject';
    expect(validatePolicy(policy).success).toBe(true);
  });
  it.each(visitorTypes)('requires an allowed default for %s', (type) => {
    const policy = clone();
    policy.rules[type].access_policy_rule_allowed_modes = ['approval'];
    policy.rules[type].access_policy_rule_default_mode = 'reject';
    expect(validatePolicy(policy).success).toBe(false);
  });
  it('rejects missing or extra visitor types, fields and malformed values', () => {
    const policy = clone();
    const { unknown: omitted, ...rules } = policy.rules;
    expect(omitted).toBeDefined();
    for (const input of [
      null,
      {},
      { ...policy, rules },
      { ...policy, rules: { ...policy.rules, stranger: omitted } },
      { ...policy, extra: true },
      {
        ...policy,
        rules: { ...policy.rules, unknown: { ...omitted, extra: true } },
      },
      {
        ...policy,
        rules: {
          ...policy.rules,
          unknown: {
            ...omitted,
            access_policy_rule_is_identity_verification_required: 'true',
          },
        },
      },
    ])
      expect(validatePolicy(input).success).toBe(false);
  });
  it('rejects empty, duplicate, invalid and null allowed modes', () => {
    for (const modes of [[], ['approval', 'approval'], ['invented'], [null]]) {
      const policy = clone();
      const input = {
        ...policy,
        rules: {
          ...policy.rules,
          unknown: {
            ...policy.rules.unknown,
            access_policy_rule_allowed_modes: modes,
          },
        },
      };
      expect(validatePolicy(input).success).toBe(false);
    }
  });
  it('accepts all four modes for a known visitor', () => {
    const policy = clone();
    policy.rules.delivery.access_policy_rule_allowed_modes = [
      ...householdAccessModes,
    ];
    expect(validatePolicy(policy).success).toBe(true);
  });
});
describe('policy previews', () => {
  it('reports scalar, default, allowed-mode and identity changes without mutation', () => {
    const a = clone();
    const b = structuredClone(policyTemplates.strict);
    const original = structuredClone(a);
    const diff = diffPolicy(a, b);
    expect(diff).toContainEqual({
      path: 'access_policy_approval_timeout_seconds_count',
      before: 90,
      after: 120,
    });
    expect(
      diff.some((change) =>
        change.path.endsWith('access_policy_rule_allowed_modes'),
      ),
    ).toBe(true);
    expect(
      diff.some((change) =>
        change.path.endsWith('access_policy_rule_default_mode'),
      ),
    ).toBe(true);
    expect(
      diff.some((change) =>
        change.path.endsWith(
          'access_policy_rule_is_identity_verification_required',
        ),
      ),
    ).toBe(true);
    expect(a).toEqual(original);
    expect(diffPolicy(a, a)).toEqual([]);
  });
  it('treats reordered modes as the same set', () => {
    const a = clone();
    const b = clone();
    b.rules.delivery.access_policy_rule_allowed_modes.reverse();
    expect(diffPolicy(a, b)).toEqual([]);
  });
});
describe('domain to SQL template equality', () => {
  it.each([
    'migrations/20261012000001_access_policy_templates.sql',
    'tests/access_policy_templates.test.sql',
  ])('matches generated %s', (path) => {
    const sql = readFileSync(
      new URL(`../../../../supabase/${path}`, import.meta.url),
      'utf8',
    );
    const literal = sql.match(/\$templates\$([\s\S]*?)\$templates\$/)?.[1];
    expect(JSON.parse(literal ?? '')).toEqual(policyTemplates);
  });
});
