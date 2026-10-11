# T24 — Independent security review of M03 (access policy)

Reviewer: Codex, 2026-10-10 (America/Buenos_Aires), independently completing the inherited draft.
Reviewed baseline: `a787d79`, including M03 implementation commit `7da9935`.

## Verdict: approve with non-blocking fixes

No exploitable tenant-isolation or authorization bypass was found in the current M03 client paths.
Hard rules hold at the database tables as well as in the RPC validator. Two low-severity findings concern
missing-data handling and future audit redaction. **Fix L1 before M04/M05 consume the helpers**, and fix L2 before
adding sensitive policy attributes. Neither currently lets a client bypass the configuration rules.

| ID  | Severity | Finding                                                                                     |
| --- | -------- | ------------------------------------------------------------------------------------------- |
| L1  | Low      | Four consumer helpers return NULL on missing data; ordinary consumer branches can fail open |
| L2  | Low      | Policy row audit requires a redaction declaration but does not apply it                     |
| I1  | Info     | Policy capability can read all tables' audit events across tenants                          |
| I2  | Info     | Platform admin with access_config membership inherits the suspended-write exception         |
| I3  | Info     | access_audit readers see raw policy history but cannot call the history RPC                 |
| I4  | Info     | Integral JSON decimals pass validation but produce an undocumented replacement error        |
| I5  | Info     | No-op saves create history and clear the applied-template marker                            |

Counts: **0 critical, 0 high, 0 medium, 2 low, 5 informational**. Only this report changes.

## Scope, method and acceptance evidence

Read `AGENTS.md`, spec §5 (P1–P3, P8, S1, S3), M03, D25, `KnowledgeBase/AccessPolicyTemplates.md`,
`KnowledgeBase/GLOSSARY.md`, prior reviews T10/T17, and author contract `reports/M03-db.md`.
Reviewed all four `20261012000000..03` migrations, `packages/domain/src/access-policy/**`, typed Supabase
wrappers/generated types, template fixture generator, M03 SQL tests/HTTP probes, schema guard and seed changes.
Read the live identity, membership, permission, subscription and audit helpers on which M03 depends.

Empirical checks used `docker exec -i supabase_db_domus psql -X -U postgres -d postgres`, impersonating callers
with `set local role authenticated` and `request.jwt.claims`; private consumer tests used `registry_writer` with
the same caller claims. All mutations, temporary fixtures, function overrides and pgTAP extension creation were
inside **rolled-back transactions**. No stack reset/restart, persistent schema/data change, server control,
HTTP write probe, staging action or push was performed.

The latest applied migration is `20261012000003`. Independently compared migration function bodies against live
`pg_proc.prosrc`: **all 22 definitions match**, including the full replacement of `audit_redacted_columns`.
All six tenants currently on the shared stack have one policy and seven rules. Seed policies remained
balanced/strict after these probes.

| Check                                                               | Result                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                         | PASS, 6 tasks; shared Turbo cache hits                                                                                                                                           |
| `pnpm typecheck`                                                    | PASS, 6 tasks; shared Turbo cache hits                                                                                                                                           |
| `pnpm test`                                                         | PASS, 5 tasks / 998 tests in replayed cache results; domain coverage 99.80% statements / 98.63% branches                                                                         |
| `pnpm --filter @domus/domain exec vitest run src/access-policy`     | Fresh execution: 25/25 pass, including both domain-to-SQL literal comparisons                                                                                                    |
| `access_policy.test.sql` through psql                               | 95/97 pass; only tests 1–2 fail: 6 policies / 42 rules on the shared stack, versus the assumed 2 seed tenants / 14 rules                                                         |
| `access_policy_templates.test.sql`                                  | Fresh execution: 3/3 pass against the applied function                                                                                                                           |
| `schema_guard.test.sql`                                             | Fresh execution: 74/74 pass                                                                                                                                                      |
| Independent missing-data/redaction/error/no-op probes               | 16/16 expected-behavior assertions pass, reproducing L1/L2/I4/I5                                                                                                                 |
| Independent bounds/revocation/isolation/history/cancellation probes | 62/62 pass                                                                                                                                                                       |
| Independent platform/suspension/expiry/support-capability probes    | 16/16 pass                                                                                                                                                                       |
| Concurrent-session probes                                           | Different event: advisory-lock wait, 3,148 ms; same event: advisory-lock wait, 3,165 ms; waiting writer creates one event after first writer rolls back; both sessions roll back |

SQL suites were piped unchanged except for creating pgTAP after `begin`, so the extension also rolls back.
TAP failures are reported above even though psql exits zero. Extra tenant counts are shared-stack fixture
assumptions, not failed isolation assertions; all M03 authorization/constraint assertions pass.
The full `pnpm test:db` and committing Auth/PostgREST probe were not re-run on the shared stack.
The author's clean-stack results in `M03-db.md` are not independently attested here.
Concurrent probes verify waiting and rollback recovery, not a committed multi-writer history chain.

Runtime: Node 25.2.1, pnpm 11.11.0, PostgreSQL 17.11, Turbo 2.11.7, Vitest 4.1.11.
Installed Turbo documentation was read before repository checks.

## Low-severity findings

### L1 — Consumer helpers do not fail closed on missing data

**Location:** `supabase/migrations/20261012000003_access_policy_defaults_helpers.sql:51`, `:58`, `:65`, `:72`;
`supabase/migrations/20261012000002_access_policy_rpcs.sql:108`.

**Scenario:** `policy_default_mode`, `policy_requires_identity`, `policy_limits` and `policy_approval_timeout`
authorize correctly, then return NULL when the required rule/header is absent. Only `policy_allows_mode` explicitly
returns false. `get_access_policy` returns `{"policy":null}`.
A consumer such as `if policy_requires_identity(...) then require_document(); end if` skips verification on NULL;
a `requested_uses > policy_limit` check similarly does not reject on NULL.
A NULL visitor argument reaches the same identity/default branch even with a complete policy.

Current clients cannot delete policies/rules. Tenant initialization and deferred completeness protect ordinary
writes. However, owner SQL can delete a whole policy and flush deferred constraints without error: completeness
only applies **if a policy exists**. A missing rule can also be observed before deferred validation inside a
transaction. A future visitor-enum extension requires a backfill; validator and completeness hard-code seven.

**Independent evidence:** deleting the unknown rule produced `allows_mode=false`, `default_mode=NULL`,
`requires_identity=NULL` for guard claims. Whole-policy deletion plus `set constraints all immediate` succeeded;
guard helpers returned `limits=NULL`, `timeout=NULL`, and the read RPC returned `{"policy":null}`.
A NULL visitor returned NULL identity requirement without deleting data. Everything rolled back.

Minimal reproduction:

```sql
begin;
delete from public.access_policy
where tenant_id = '10000000-0000-0000-0000-000000000001';
set constraints all immediate; -- succeeds
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated","aal":"aal1"}', true);
set local role registry_writer;
select app_private.policy_limits('10000000-0000-0000-0000-000000000001'),
       app_private.policy_approval_timeout('10000000-0000-0000-0000-000000000001');
-- NULL, NULL
reset role;
rollback;
```

**Fix:** reject NULL visitors and raise a stable unavailable-policy error after authorization when a required row
is absent. Do not coalesce identity requirements to false or supply permissive limits. Reject absent/incomplete
snapshots in the read RPC. Enforce one policy per surviving tenant at deferred validation while preserving tenant
deletion cascades. If the fixed catalog changes, backfill atomically and derive completeness from the enum.
Document the non-null/error contract for M04/M05.

### L2 — Policy row audit ignores declared redaction

**Location:** `supabase/migrations/20261012000002_access_policy_rpcs.sql:71`, `audit_access_policy_row`.

**Scenario:** the trigger checks that `audit_redacted_columns(tg_table_name)` is not NULL, then inserts whole
`to_jsonb(old)` / `to_jsonb(new)` snapshots without masking declared columns. Both current lists are empty and
contain no contact/document PII; no current sensitive value was found leaking. Future sensitive attributes would
be retained even if their migration declared redaction, violating `AGENTS.md`.

**Independent evidence:** inside a savepoint, replaced the declaration function so `access_policy` marked
`access_policy_updated_by_user_id` redacted, then applied strict as seed admin 2. The row audit's `after` still
contained the column and its full seed UUID. Rolled back the declaration override and writes.
A second probe excluded all pre-existing audit IDs and found exactly one newly inserted row event retaining it.
This sentinel attribute proves the mechanism; it does not assert a present-day document/contact leak.
The generic `audit_row_change` masks declared values correctly.

Reproduction sequence, all in one transaction:

```sql
begin;
create temp table review_audit_before as select audit_event_id from public.audit_event;
create or replace function app_private.audit_redacted_columns(target_table text)
returns text[] language sql immutable set search_path = '' as $$
  select case
    when target_table = 'access_policy' then array['access_policy_updated_by_user_id']::text[]
    when target_table = 'access_policy_rule' then array[]::text[]
    else null::text[]
  end;
$$;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select public.apply_access_policy_template(
  '10000000-0000-0000-0000-000000000001', 'strict', gen_random_uuid());
reset role;
select audit_event_diff -> 'after' ->> 'access_policy_updated_by_user_id'
from public.audit_event
where audit_event_table_name = 'access_policy'
  and audit_event_id not in (select audit_event_id from review_audit_before)
  and audit_event_diff -> 'after' ->> 'access_policy_updated_by_user_id'
      = '20000000-0000-0000-0000-000000000002';
-- Declared-redacted value is still present.
rollback;
```

**Fix:** apply the declared list to both snapshots before insertion, preserving value-free changed markers where
needed. Apply equivalent redaction to aggregate history if policy values can later contain PII.
Add a behavioral test: the schema guard verifies declaration, not application. Document the dedicated
`{before,after}` audit shape, which differs from the generic per-column `{old,new}` diff.

## Informational findings

### I1 — Audit capability is broader than necessary

**Location:** `20261012000002_access_policy_rpcs.sql:180`.

**Scenario/evidence:** live `audit_event` SELECT policy for `access_policy_writer` is `using(true)`, with table
SELECT granted. It can read every tenant's events for any module. The history RPC authorizes first and filters
tenant and `access_policy_change`; no current client leak was found. Future functions inherit excess capability.

**Fix:** restrict this role's audit SELECT to `audit_event_table_name='access_policy_change'`, retaining
authorization and tenant filtering in the RPC. Internal receipt/configuration capabilities also span tenants by
design; their safety depends on authorization-first wrappers.

### I2 — Platform membership inherits suspended-write exception

**Location:** `require_access_policy` at `20261012000000_access_policy_schema.sql:85`, via existing
`writable_permission_tenant_ids` / `writable_tenant_ids`.

**Scenario/evidence:** temporarily gave platform admin 1 a tenant-admin membership with `access_config`,
suspended that tenant, and successfully applied strict with aal2 claims. Ordinary admin 2 was denied.
This is inherited semantics: `writable_tenant_ids` includes all tenants for platform admins; M03 still requires
a permission-bearing membership. Platform status alone cannot call policy RPCs. Fixture changes rolled back.

**Fix/decision:** document the exception, or require pilot/active subscription status in addition to the
permission. Do not describe suspended-write denial as universal.

### I3 — History permissions differ between RPC and raw audit

**Location:** `20261012000002_access_policy_rpcs.sql:168`, and existing `audit_event` RLS.

**Scenario/evidence:** temporarily made admin 12 `access_audit`-only. History RPC returned
`42501 Access policy denied`; direct audit SELECT exposed the same full `access_policy_change` snapshots.
UPDATE/DELETE attempts were denied. This matches the author contract and separate audit permission; it is not
an escalation or tenant leak.

**Fix/decision:** decide whether the configuration-history UI is exclusive to `access_config` or also available
to `access_audit`, and document both surfaces. If both should use the UI, change the RPC deliberately.
M03-F06 does not resolve the role distinction.

### I4 — Integral decimals violate the validation-error contract

**Location:** `20261012000002_access_policy_rpcs.sql:2` and `:42`.

**Scenario/evidence:** JSON timeout `90.0` passes `value=trunc(value)`, but replacement casts text `90.0` directly
to integer, raising `22P02` rather than `22023 Invalid access policy`. The transaction aborts safely.
JavaScript serialization emits 90, so this mainly affects handcrafted RPC calls.

**Fix:** cast validated values through numeric to integer, or reject decimal representations consistently
inside the validator. Add the RPC error-contract case.

### I5 — No-op saves create empty effective changes

**Location:** `20261012000002_access_policy_rpcs.sql:42`, `:124`; domain `diffPolicy`.

**Scenario/evidence:** a fresh-event save of unchanged balanced data succeeded, cleared the applied-template
marker and added one aggregate event. Code reading shows reordered mode arrays also update rows, while the
domain diff treats arrays as sets. Same-event retries remain correctly deduplicated.

**Fix:** decide whether explicit no-ops belong in history. If not, canonicalize sets and compare effective policies
before replacement, retaining the template marker when unchanged. The UI can also disable empty saves.

## Verified OK

- **Isolation (S1).** Public policy tables and private receipts have RLS. Client configuration SELECT uses the
  set-returning `permission_tenant_ids('access_config')`. Admin A sees only its header/seven rules.
  Holders/members/guards/registry-only admins get the documented policy projection without metadata.
  Holders cannot read raw tables. Cross-tenant/nonexistent targets give uniform denial before policy lookup;
  independent member probes checked all five internal helpers for both target classes.
  Composite tenant/policy FK rejects foreign rules under owner SQL.
- **Authorization/retries.** No client configuration DML, permission-table writes or membership in the capability
  role. RPC authorization precedes validation, receipt lookup and locks. Receipts bind tenant, actor, support
  session, operation and exact input. Changed-input retries and represented-user replay of support receipts fail.
  Revoked access_config immediately denies old receipts/removes metadata. Expired membership denies reads/writes.
  Ordinary suspended tenants deny writes/retries but allow reads/history/helpers; cancelled tenants deny
  reads/history/all helpers. Platform-with-membership suspension exception is I2.
- **Support.** Existing SQL tests cover dual-tenant targets, immediate session termination, administrative support
  writes and actor/represented-user attribution. Independent probes checked all five helpers against a target's
  other membership tenant. Platform status without membership has no standing policy RPC access.
- **Server hard rules (P1/P8; unknown boundary relevant to P2/P3).** Owner CHECK tests reject unknown direct/notify,
  disallowed defaults, empty/duplicate/NULL/multidimensional arrays and all out-of-range bounds. NOT NULL
  attributes reject SQL NULL. RPC tests reject incomplete/missing-visitor policies, extra fields, invalid modes,
  NULL identity flags and malformed arrays. Independent RPC probes accepted every inclusive scalar endpoint and
  rejected ±1, fractional, NULL and string numbers. NULL policy/template/event and partial payloads were denied.
  Templates are fixed enum/literal data; history provides no write/restore API.
- **Defaults/templates (M03-F05/D25).** Always-enabled tenant initializer applies balanced in the creating
  transaction; create_tenant equality test passes. It authorizes owner/platform creation first. Migration
  backfills existing tenants; all current tenants have complete policies. Documented template values match the
  domain. Fresh domain tests compare both SQL literals to policyTemplates; fresh pgTAP compares the applied
  function to the fixture. This closes the domain → SQL → applied DB chain. Seed balanced/strict tests pass.
- **Concurrency.** Different events wait on the tenant lock; same events wait on the event lock.
  Independent probes checked `pg_stat_activity` and one history entry after rollback recovery. Normal
  single-RPC lock order is event then tenant. This does not prove committed history continuity or arbitrary
  multi-RPC transaction deadlock freedom.
- **Definer hygiene / AGENTS.md.** All 22 live bodies match migrations. Every definer has empty fixed search_path
  and qualified application objects. RPC owner is NOLOGIN/NOINHERIT access_policy_writer; audit capture belongs
  to audit_writer. Capability lacks cluster elevation/client membership/persistent CREATE.
  PUBLIC/anon/service execute is revoked; authenticated receives four public RPCs, not private consumers.
  app_private is not PostgREST-exposed; neither table is published for realtime. Target-row reads/locks follow
  authorization. Definitions are complete; earlier redaction entries are preserved, without source patching.
  Wrappers use generated DB types, and glossary covers new concepts.
- **Audit (S3/M03-F06).** Replacements record full before/after, template, event, actor, support session and
  represented user. Always-enabled row capture covers INSERT/UPDATE/DELETE; current snapshots contain no
  contact/document PII. History returns aggregate changes only. Configuration capability cannot UPDATE/DELETE
  audit, and direct audit-reader mutation fails. Existing retention belongs to a separate purger.
  Future redaction is L2.
- **Domain/tests.** Zod strict objects/exhaustive enum records enforce all seven rules. Diffs ignore mode order
  and preserve inputs. Fresh access-policy tests pass; cached full-domain coverage exceeds 80%.
  No fresh full coverage collection was performed.

## Missing automated cases and integration decisions

1. Missing rule/header and NULL visitor for every helper, with the chosen fail-closed error; absent/incomplete
   read snapshots (L1). Whole-policy deletion must fail for surviving tenants once that invariant is added.
2. Behavioral redaction of a temporarily declared attribute in row/aggregate audit (L2), and audit diff shape.
3. RPC acceptance at every inclusive bound, invalid forms for each scalar, and domain ↔ DB bounds equality.
   Reviewer probes cover endpoints; checked-in SQL tests currently cover rejection at ±1.
4. Different-event **committed** concurrent writes: later before_policy equals earlier after_policy.
   Keep same-event retry tests; add cross-tenant/operation/session receipt conflicts and newest-first history.
   Rolled-back probes cannot prove the committed chain.
5. Cancelled read/history/all helpers; suspended guard helpers; expired/revoked membership; support helpers bound
   to another tenant. Independent probes cover these, but checked-in tests sample the helper matrix.
6. Platform-with-membership suspension (I2), access_audit-only history (I3), decimal RPC error (I4), and
   fresh-event no-op/reordered saves (I5), once contracts are decided.
7. Scope seed counts to seed tenant IDs or document a clean-stack prerequisite. Global counts fail on a valid
   shared stack with additional e2e tenants.

M04 must serialize preferences with `policy-tenant:<tenant UUID>`, check stored modes against current policy at
decision time, fall back to the institutional default, and correct/notify transactionally.
M05 must enforce identity, recurring schedules, limits and timeout/silence server-side. Readable suspended-policy
helpers do not authorize operational writes. Grant dedicated consumer roles only needed private functions;
current registry_writer grants are a bridge. A device-only caller needs an explicitly authorized identity path.

M03-F02 models timeout; backup-call order/behavior is not added here. Confirm the unit-contact/M05 handoff at
HR-03. D25 template values remain an HR-03 proposal. Naming follows the glossary, but mode/template suffixes and
`access_policy_rule_tenant_id_visitor_type_key` do not exactly follow AGENTS.md's generic naming conventions;
decide renames before consumers bind. Private receipts retain non-PII input/result without specific retention.
