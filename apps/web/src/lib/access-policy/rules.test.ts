import {
  accessPolicyBounds,
  householdAccessModes,
  policyTemplates,
  validatePolicy,
  visitorTypes,
} from '@domus/domain/access-policy';
import type { AccessPolicy } from '@domus/domain/access-policy';
import { describe, expect, it } from 'vitest';
import {
  canClearMode,
  isLimitInRange,
  isModeSelectable,
  limitInputsOf,
  limitKeys,
  limitValueUnit,
  parseChangePath,
  parseLimitInput,
  setDefaultMode,
  setIdentityRequired,
  toggleMode,
  withLimitInputs,
} from './rules';

const balanced = (): AccessPolicy => structuredClone(policyTemplates.balanced);

describe('isModeSelectable', () => {
  it('agrees with the domain validator for every visitor type and mode', () => {
    for (const visitor of visitorTypes) {
      for (const mode of householdAccessModes) {
        const policy = balanced();
        policy.rules[visitor] = {
          access_policy_rule_allowed_modes: [mode],
          access_policy_rule_default_mode: mode,
          access_policy_rule_is_identity_verification_required: true,
        };
        expect(isModeSelectable(visitor, mode), `${visitor} / ${mode}`).toBe(
          validatePolicy(policy).success,
        );
      }
    }
  });
});

describe('toggleMode', () => {
  const rule = policyTemplates.balanced.rules.delivery;

  it('adds a mode in canonical order', () => {
    const next = toggleMode(rule, 'delivery', 'direct_entry', true);
    expect(next.access_policy_rule_allowed_modes).toEqual([
      'direct_entry',
      'notify',
      'approval',
      'reject',
    ]);
    expect(next.access_policy_rule_default_mode).toBe('approval');
  });

  it('moves the default to the first allowed mode when its mode is switched off', () => {
    const next = toggleMode(rule, 'delivery', 'approval', false);
    expect(next.access_policy_rule_allowed_modes).toEqual(['notify', 'reject']);
    expect(next.access_policy_rule_default_mode).toBe('notify');
  });

  it('never removes the last allowed mode', () => {
    const single = {
      ...rule,
      access_policy_rule_allowed_modes: ['reject' as const],
      access_policy_rule_default_mode: 'reject' as const,
    };
    expect(canClearMode(single, 'reject')).toBe(false);
    expect(toggleMode(single, 'delivery', 'reject', false)).toBe(single);
  });

  it('refuses direct entry and notice for an unknown visitor', () => {
    const unknown = policyTemplates.balanced.rules.unknown;
    expect(toggleMode(unknown, 'unknown', 'direct_entry', true)).toBe(unknown);
    expect(toggleMode(unknown, 'unknown', 'notify', true)).toBe(unknown);
    expect(
      toggleMode(unknown, 'unknown', 'reject', false)
        .access_policy_rule_allowed_modes,
    ).toEqual(['approval']);
  });

  it('only accepts a default among the allowed modes', () => {
    expect(setDefaultMode(rule, 'direct_entry')).toBe(rule);
    expect(setDefaultMode(rule, 'reject').access_policy_rule_default_mode).toBe(
      'reject',
    );
  });

  it('switches identity verification', () => {
    expect(
      setIdentityRequired(rule, true)
        .access_policy_rule_is_identity_verification_required,
    ).toBe(true);
  });
});

describe('limit inputs', () => {
  it('reads whole numbers only', () => {
    expect(parseLimitInput(' 90 ')).toBe(90);
    for (const text of ['', 'abc', '1.5', '-3', '1e2', '9 0'])
      expect(parseLimitInput(text), text).toBeNaN();
  });

  it('checks the bounds of the domain, inclusive', () => {
    for (const key of limitKeys) {
      const [min, max] = accessPolicyBounds[key];
      expect(isLimitInRange(key, min)).toBe(true);
      expect(isLimitInRange(key, max)).toBe(true);
      expect(isLimitInRange(key, min - 1)).toBe(false);
      expect(isLimitInRange(key, max + 1)).toBe(false);
      expect(isLimitInRange(key, Number.NaN)).toBe(false);
    }
  });

  it('applies typed limits to a policy, and invalid text fails the domain validator', () => {
    const policy = balanced();
    const inputs = limitInputsOf(policy);
    expect(withLimitInputs(policy, inputs)).toEqual(policy);
    expect(
      validatePolicy(
        withLimitInputs(policy, {
          ...inputs,
          access_policy_approval_timeout_seconds_count: '29',
        }),
      ).success,
    ).toBe(false);
    expect(
      validatePolicy(
        withLimitInputs(policy, {
          ...inputs,
          access_policy_pass_max_uses_count: 'x',
        }),
      ).success,
    ).toBe(false);
  });

  it('names a value unit for every limit', () => {
    expect(limitKeys.map(limitValueUnit)).toEqual([
      'seconds',
      'days',
      'uses',
      'days',
      'guests',
    ]);
  });
});

describe('parseChangePath', () => {
  it('reads limit columns and rule fields', () => {
    expect(parseChangePath('access_policy_pass_max_uses_count')).toEqual({
      kind: 'limit',
      key: 'access_policy_pass_max_uses_count',
    });
    expect(
      parseChangePath('rules.delivery.access_policy_rule_default_mode'),
    ).toEqual({ kind: 'rule', visitor: 'delivery', field: 'defaultMode' });
    expect(
      parseChangePath(
        'rules.unknown.access_policy_rule_is_identity_verification_required',
      ),
    ).toEqual({ kind: 'rule', visitor: 'unknown', field: 'identity' });
    expect(
      parseChangePath('rules.pass_guest.access_policy_rule_allowed_modes'),
    ).toEqual({ kind: 'rule', visitor: 'pass_guest', field: 'allowedModes' });
  });

  it('refuses anything else', () => {
    expect(
      parseChangePath('rules.nobody.access_policy_rule_default_mode'),
    ).toBeNull();
    expect(parseChangePath('rules.delivery.other')).toBeNull();
    expect(parseChangePath('something')).toBeNull();
  });
});
