# M03 access policy database and domain — T22

Implemented and verified locally on `JI-Serra/h3-t22-policy-db` (2026-10-10 local time). Contract published for the H3 UI worker before completion. No staging changes or push.

## Domain contract

Import `@domus/domain/access-policy`: `visitorTypes`, `householdAccessModes`, `accessPolicyTemplates`, `visitorTypeSchema`, `householdAccessModeSchema`, `accessPolicyTemplateSchema`, `accessPolicySchema`, `accessPolicyRuleSchema`, `accessPolicyBounds`, `policyTemplates`, `validatePolicy`, `diffPolicy`, and their inferred types. Template codes are `balanced` (Equilibrado), `strict` (Estricto), `flexible` (Flexible); keep their Spanish labels in UI i18n.

`policyTemplates` supplies preview inputs. Clone before editing. `validatePolicy(input)` returns Zod's safe parse result; `accessPolicySchema.parse(input)` validates strictly. `diffPolicy(before, after)` returns deterministic `{path, before, after}[]`, ignoring array order for allowed-mode sets. All seven visitor keys are required, unknown keys rejected, allowed modes must be a nonempty unique array, and defaults must belong to that array. Unknown visitors allow only `approval` and `reject`. Identity flags must be JSON booleans. Numbers must be JSON integers, with these inclusive bounds confirmed by the coordinator:

| Field                                                  | Bounds |
| ------------------------------------------------------ | ------ |
| `access_policy_approval_timeout_seconds_count`         | 30–300 |
| `access_policy_permanent_authorization_max_days_count` | 1–3650 |
| `access_policy_pass_max_uses_count`                    | 1–100  |
| `access_policy_pass_max_days_count`                    | 1–365  |
| `access_policy_event_max_guests_count`                 | 1–1000 |

Whole-policy payload example (abbreviated rule list: send all seven):

```ts
const policy = structuredClone(policyTemplates.balanced);
policy.rules.delivery = {
  access_policy_rule_allowed_modes: ['notify', 'approval', 'reject'],
  access_policy_rule_default_mode: 'approval',
  access_policy_rule_is_identity_verification_required: false,
};
```

## RPCs and UI flow

Typed wrappers are exported from `@domus/supabase/access-policy`; generated database types remain the source for all row and RPC argument types.

| RPC                                                                                                          | Result                     | Access                                                            |
| ------------------------------------------------------------------------------------------------------------ | -------------------------- | ----------------------------------------------------------------- |
| `get_access_policy(target_tenant_id uuid)`                                                                   | JSON `{policy, metadata?}` | Active tenant memberships; support is bound to its session tenant |
| `apply_access_policy_template(target_tenant_id uuid, template access_policy_template, client_event_id uuid)` | JSON `{policy, metadata}`  | Admin with `access_config`, writable tenant                       |
| `update_access_policy(target_tenant_id uuid, policy jsonb, client_event_id uuid)`                            | JSON `{policy, metadata}`  | Same; strict whole-policy replacement                             |
| `access_policy_history(target_tenant_id uuid)`                                                               | Rows described below       | Admin with `access_config`; suspended reads allowed               |

`policy` contains exactly the five numeric fields above plus `rules`, an object keyed by the seven `visitor_type` codes. Each rule has exactly the three fields in the example. Admin-only `metadata` contains `access_policy_id`, `access_policy_applied_template` (null after a custom edit), `access_policy_updated_by_user_id` (nullable for migration/seed initialization), and `access_policy_updated_at`. Members/holders/guards/other admins receive no metadata and cannot browse either raw table; use the read RPC for M04/M05. A platform admin has no standing access to policy RPCs without a tenant membership; authorized support consumes the target's bound rights.

Use `getAccessPolicy` to load, parse `data.policy` with the domain schema, and preview a template with `diffPolicy`. Generate one UUID per submitted change and retain it on network retry. Reusing it with a different actor, support session, tenant, operation or JSON input is rejected. Repeated valid calls return the original result and add no duplicate audit events; later changes do not change that retry result. Authorization runs before receipt lookup, validation or tenant locks, including on retries. Reapplying a template restores its exact values. Custom saves clear the applied template.

History rows contain `audit_event_id`, `audit_event_actor_user_id`, `audit_event_occurred_at`, `audit_event_on_behalf_of_user_id`, `support_session_id`, `before_policy`, `after_policy`, `access_policy_applied_template`, `client_event_id`. Use `diffPolicy` on the snapshots for the preview; user UUID identifies who changed it, and support entries retain both real actor and represented user. Entries are ordered newest first. Initialization is audited as table inserts; this change-history RPC lists explicit administrative replacements. Every row change also has append-only table audit events with before/after values. No policy field contains PII requiring redaction; both tables declare empty redaction lists.

Uniform authorization error: SQLSTATE `42501`, `Access policy denied`; invalid payloads: `22023`, `Invalid access policy`; conflicting retries: `42501`, `Access policy retry denied`. Translate UI messages via es-AR i18n rather than displaying raw SQL errors.

## Database and future consumers

`access_policy` has one row per tenant and scalar CHECKs; `access_policy_rule` has exactly one row per visitor type per tenant, enforced by unique keys plus an always-enabled deferred completeness trigger. A composite `(tenant_id, access_policy_id)` FK prevents foreign-tenant rule references. All tenant tables have RLS and tenant-leading indexes. Authenticated users have no configuration DML grants; only authorized RPCs enter the dedicated NOLOGIN/NOINHERIT `access_policy_writer`. The capability has no cluster elevation, client role membership, or persistent schema CREATE privilege. Audit insertion belongs exclusively to `audit_writer`.

Internal, authorization-first `app_private` helpers are stable SECURITY DEFINER functions with an empty search path. They are not exposed by PostgREST or granted directly to clients; `registry_writer` is granted execution for later SQL consumers. Future dedicated consumer roles must be granted only the functions needed. They require a validated caller with an active membership in the target tenant (including guard), preserving support tenant binding:

| Helper                                                                                   | Return                            |
| ---------------------------------------------------------------------------------------- | --------------------------------- |
| `policy_allows_mode(target_tenant_id, visitor visitor_type, mode household_access_mode)` | boolean                           |
| `policy_default_mode(target_tenant_id, visitor visitor_type)`                            | household_access_mode             |
| `policy_requires_identity(target_tenant_id, visitor visitor_type)`                       | boolean                           |
| `policy_limits(target_tenant_id)`                                                        | JSON with the four maximum fields |
| `policy_approval_timeout(target_tenant_id)`                                              | integer seconds                   |

`create_tenant` and every authorized tenant INSERT initialize balanced atomically via an always-enabled trigger; existing tenants are backfilled balanced. Seed Los Ceibos stays balanced; Las Tipas starts balanced then is replaced with strict for contrast. Template SQL and the pgTAP expected fixture are generated from `packages/domain/src/access-policy/templates.ts` using `node supabase/fixtures/generate-access-policy.mjs`; domain tests compare both checked-in SQL literals to that source and pgTAP compares the applied database function to the literal. Do not regenerate an applied migration to change templates: create a new versioned migration and update the equality contract together.

No preferences exist yet. M04 must join `unit_access_preference` on tenant and visitor type, find stored modes outside `access_policy_rule_allowed_modes`, use the new default immediately, and notify the household. Serialize preference writes with policy updates using the `policy-tenant:<tenant UUID>` advisory lock convention, then validate against the current policy. Implement persisted corrections and notifications transactionally in M04, without silently permitting an obsolete mode. P2/P3 remain separate decision-engine rules: timeout/silence never approves, and do-not-disturb never grants access. M05 must enforce recurring schedules, identity requirements and pass/event limits server-side.

## Acceptance

| Check                                                                                          | Result                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm supabase db reset`                                                                       | PASS: all four H3 migrations and both fictional tenants from a clean local database                                                                                                          |
| `pnpm test:db`                                                                                 | PASS: **1,235 assertions in 20 files**, including all existing suites                                                                                                                        |
| `node --test supabase/probes/access-policy.test.mjs`                                           | PASS: **5 real Auth/PostgREST tests**, with concurrent same-event retries, member projections, history snapshots, invalid inputs, direct-write denial and suspended/anonymous/service denial |
| `pnpm gen:types`                                                                               | PASS: regenerated and formatted against the local schema                                                                                                                                     |
| `pnpm exec supabase db lint --local --schema public,app_private --level error --fail-on error` | PASS: no schema errors                                                                                                                                                                       |
| `pnpm lint`                                                                                    | PASS: six tasks                                                                                                                                                                              |
| `pnpm typecheck`                                                                               | PASS: six tasks                                                                                                                                                                              |
| `pnpm test`                                                                                    | PASS: **998 tests** (domain 193, Supabase 44, web 705, observability 30, UI tokens 26)                                                                                                       |
| `pnpm build`                                                                                   | PASS: Next.js production build, 42 generated pages                                                                                                                                           |
| Domain coverage                                                                                | **99.80% statements, 98.63% branches, 100% functions/lines**; access policy schemas/diff/templates **100%** in all executable categories                                                     |

Runtime: Node 25.2.1, pnpm 11.11.0, Supabase CLI 2.120.0, PostgreSQL 17.11, Turborepo 2.11.7, Next.js 16.4.0, Vitest 4.1.11. The installed Turbo docs were consulted for domain task cache inputs: SQL template migration and expected pgTAP fixture changes invalidate the domain template-equality test cache. The existing Node localstorage-file warnings remain; all tests pass.

The pgTAP additions exercise direct-owner SQL CHECKs, default membership, duplicate/empty/null/multidimensional mode arrays, complete rule sets, composite foreign keys, admin permission separation, household/guard projections, support binding and revocation, support write attribution, cross-actor retry denial, suspended writes, history deduplication, internal helpers and exclusive capability ACLs. SQL functions are complete definitions; central identity helpers and set-returning policy helpers are preserved. Dedicated NOINHERIT owners issue their own function ACL changes, and the schema guard checks that PUBLIC/anonymous/service cannot execute the new RPCs/private consumers.

The HTTP probe creates and removes its own fictional tenant and uses ordinary seeded account logins. It does not reset the shared stack or change either demo tenant's policy. Cleanup preserves append-only audit events. Existing empty-tenant deletion still works via cascading policy defaults while retaining audit history. After the final clean reset passed, the coordinator started T23 on the shared stack; no further reset was performed.

Remaining integration work belongs to the coordinator: integrate the UI, apply reviewed migrations to staging, and validate D25 template values in HR-03. M04 fallback/notification and M05 decision enforcement are documented future module work, not implemented by this database task.
