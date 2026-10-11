import type {
  AccessPolicy,
  AccessPolicyRule,
  AccessPolicyTemplate,
  HouseholdAccessMode,
} from './schema';

const rule = (
  allowed: HouseholdAccessMode[],
  mode: HouseholdAccessMode,
  identity: boolean,
): AccessPolicyRule => ({
  access_policy_rule_allowed_modes: allowed,
  access_policy_rule_default_mode: mode,
  access_policy_rule_is_identity_verification_required: identity,
});
const limits = (
  timeout: number,
  permanent: number,
  uses: number,
  days: number,
  guests: number,
) => ({
  access_policy_approval_timeout_seconds_count: timeout,
  access_policy_permanent_authorization_max_days_count: permanent,
  access_policy_pass_max_uses_count: uses,
  access_policy_pass_max_days_count: days,
  access_policy_event_max_guests_count: guests,
});
/** D25; generate the immutable SQL fixture from these values, never maintain a second template by hand. */
export const policyTemplates: Record<AccessPolicyTemplate, AccessPolicy> = {
  balanced: {
    ...limits(90, 365, 10, 7, 100),
    rules: {
      permanent_authorized: rule(
        ['direct_entry', 'notify', 'approval'],
        'direct_entry',
        false,
      ),
      recurring_authorized: rule(
        ['direct_entry', 'notify', 'approval'],
        'direct_entry',
        true,
      ),
      pass_guest: rule(['direct_entry', 'notify'], 'notify', true),
      event_guest: rule(['direct_entry', 'notify'], 'direct_entry', true),
      delivery: rule(['notify', 'approval', 'reject'], 'approval', false),
      service_worker: rule(
        ['direct_entry', 'notify', 'approval'],
        'notify',
        true,
      ),
      unknown: rule(['approval', 'reject'], 'approval', true),
    },
  },
  strict: {
    ...limits(120, 180, 3, 1, 50),
    rules: {
      permanent_authorized: rule(['notify', 'approval'], 'notify', true),
      recurring_authorized: rule(['notify', 'approval'], 'notify', true),
      pass_guest: rule(['notify', 'approval'], 'notify', true),
      event_guest: rule(['notify', 'approval'], 'notify', true),
      delivery: rule(['approval', 'reject'], 'approval', true),
      service_worker: rule(['notify', 'approval'], 'approval', true),
      unknown: rule(['approval', 'reject'], 'approval', true),
    },
  },
  flexible: {
    ...limits(60, 730, 20, 30, 300),
    rules: {
      permanent_authorized: rule(
        ['direct_entry', 'notify', 'approval'],
        'direct_entry',
        false,
      ),
      recurring_authorized: rule(
        ['direct_entry', 'notify', 'approval'],
        'direct_entry',
        false,
      ),
      pass_guest: rule(['direct_entry', 'notify'], 'direct_entry', false),
      event_guest: rule(['direct_entry', 'notify'], 'direct_entry', false),
      delivery: rule(
        ['direct_entry', 'notify', 'approval', 'reject'],
        'notify',
        false,
      ),
      service_worker: rule(
        ['direct_entry', 'notify', 'approval'],
        'direct_entry',
        true,
      ),
      unknown: rule(['approval', 'reject'], 'approval', true),
    },
  },
};
