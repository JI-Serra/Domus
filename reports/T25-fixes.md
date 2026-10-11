# T25 ? M03 policy review fixes

Completed locally on `JI-Serra/h3-t25-policy-fixes`, 2026-10-11. No staging change or push.

## Changes and decisions

- **L1:** all four non-boolean policy consumers and the read RPC now raise `55000 / Access policy unavailable` for missing headers or incomplete rules. The shared snapshot checks completeness against the visitor enum. Default/identity helpers reject NULL visitors with the same error, after authorization. A missing institutional policy is an integrity failure, so raising is safer than silently supplying a default. NULL tenants and unauthorized callers retain the uniform authorization error. Invalid text is rejected by the enum cast before entry. `policy_allows_mode` keeps false as its safe missing-rule result.
- A surviving tenant cannot lose its whole policy at deferred constraint validation. Completeness derives the rule count from the enum; empty-tenant deletion cascades still work. Future enum additions require an atomic rule backfill.
- **L2:** extracted the generic audit value-free masking into `mask_audit_columns`; both the existing generic function and policy row capture reuse it. Header/rule before and after snapshots honor `audit_redacted_columns`, retaining only `{"changed":true}` for declared fields. Aggregate history uses the same masking for header fields and each visitor rule. Authorization, owners, append-only storage and row audit shapes are preserved.
- **I1:** restricted policy writer audit reads to `access_policy_change` events. **I4:** validated integer JSON values cast through numeric before integer storage, so `90.0` succeeds while `90.5` keeps the documented invalid-policy error.
- Scoped the review's two fragile global seed counts to the two seed tenant IDs, preserving their assertions with extra e2e tenants present. History assertions additionally use the existing-history baseline and this test's event ID.
- Updated `reports/M03-db.md` with helper errors, masking behavior, numeric semantics and I2/I3/I5 contracts. I2 retains the inherited platform-with-membership suspension exception; I3 retains separate config RPC and raw audit permissions; I5 retains fresh-event no-op history. Changing those product/security contracts is outside this fix.

## Regression evidence

`access_policy_fail_closed.test.sql` adds 32 assertions. Savepoints simulate deleted headers/rules, exercise every helper and RPC, then restore fixtures. Coverage includes NULL tenant/visitor arguments, invalid enum literals, safe false mode checks, surviving-tenant completeness and tenant deletion cascades. The reviewer's actor UUID sentinel is temporarily declared redacted; tests exclude pre-existing audit IDs and check both row snapshots, rule redaction, and aggregate masking. Additional tests deny unrelated audit capability reads and verify integral/fractional JSON number handling. All fixture writes and declaration overrides roll back.

The first run after adding decimal tests exposed a test-fixture mistake: rollback restored guard claims before the admin write assertions. Restoring admin claims resolved it; the final complete database run passes.

## Acceptance

| Check                           | Result                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm supabase migration up`    | PASS, applied new migrations 000004 and 000005 only; announced each application through coordinator status |
| `pnpm test:db`                  | PASS, **1,267 assertions in 21 files**, including **32 new regressions**                                   |
| `pnpm gen:types` and formatting | PASS; generated public types identical to baseline, no signature changes                                   |
| `pnpm lint`                     | PASS, 6 tasks (5 cache hits)                                                                               |
| `pnpm typecheck`                | PASS, 6 tasks (5 cache hits)                                                                               |
| `pnpm test`                     | PASS, 5 tasks / **998 tests** (3 cached tasks; Supabase and web fresh)                                     |
| Domain coverage                 | Unchanged; cached baseline 99.80% statements / 98.63% branches                                             |

Runtime: Node 25.2.1, pnpm 11.11.0, Supabase CLI 2.120.0, PostgreSQL 17.11, Turbo 2.11.7, Vitest 4.1.11. Installed Turbo task documentation was read. Existing Node localstorage warnings remain non-failing.

## Integration

Integrate the commit and both new migrations; the second migration extends the first without editing already-applied SQL. The shared local stack was never reset or restarted and the UI worker's port 3001 was untouched. Coordinator owns staging application and broader H3 integration; no remaining T25 implementation work.
