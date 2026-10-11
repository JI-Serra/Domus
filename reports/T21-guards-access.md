# T21 ? M02-F06 guards permission management

Implemented the additive guard management contract in `reports/M02-db.md`. Only new migration files were added; previously applied migrations were left intact.

## Changes and decisions

- `20261011000024_guards_management.sql`: complete definitions for invitation grantor authorization, grant acceptance validation, creation and revocation; minimized `list_tenant_guards` RPC; initial guard deactivation implementation.
- `20261011000025_guards_revocation_capability.sql`: complete final guard revocation definition and integrity trigger, with a private registry-writer capability restricted to revoking existing guards. The public RPC is recreated under its original owner with explicit ACLs; this retains registry/admin/platform deactivation behavior while keeping guard-only audit writes on the dedicated capability.
- Generated Supabase types expose `list_tenant_guards({target_tenant_id}) -> Json`; `listTenantGuards` passes the requested tenant without client authorization decisions. Existing invitation and revocation wrappers keep their signatures.
- The read returns `{guards, pending_invitations}` with the exact field projection documented in M02-db. No broader RLS policy, document/birthday exposure, resident/unit access or permission-table mutation was added.
- Guard issuance and acceptance retain self-target, current grantor, verified email, retry and no-support-invitation safeguards. Support guard list/deactivation remains bound to its support tenant and attributed in audit.
- Gates and devices already authorize `guards`; their existing SQL definitions are unchanged and covered by the new guards-only tests.

## Acceptance

| Command                      | Result                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm supabase migration up` | Both migrations applied to existing shared local stack; no reset/restart            |
| `pnpm gen:types`             | Passed; generated file formatted to match repository style                          |
| `pnpm test:db`               | Passed: 18 files, 1,135 assertions, including 58 guard management assertions        |
| `pnpm lint`                  | Passed: 6 tasks                                                                     |
| `pnpm typecheck`             | Passed: 6 tasks                                                                     |
| `pnpm test`                  | Passed: 5 tasks; web 566 tests, shared Supabase wrapper and migration checks passed |
| `git diff --check`           | Passed                                                                              |

pgTAP covers direct and support deactivation, invitation creation/delivery/cancellation/acceptance, exact read allowlists, hidden person PII/residents/units, cross-tenant and foreign gate/device targets, unchanged registry-only access, suspended writes, malformed support identity, multi-tenant support binding, denied permission grants and anonymous/service-role ACLs. The first run revealed permission-row locking and integrity-trigger errors in the initial writer-owned deactivation path; the additive follow-up migration fixes those, and the full suite passes.

Runtime: Node 25.2.1, pnpm 11.11.0, Supabase CLI 2.120.0, Turborepo 2.11.7. Existing domain coverage is unchanged and its configured coverage suite passes. The task-referenced `reports/M02-admin-ui.md` is absent from this branch, so its quoted finding in the dispatch was used.

No UI or staging changes were made. The UI worker should replace the registry-only guard list query with `list_tenant_guards`; integration and deployment remain with the coordinator.
