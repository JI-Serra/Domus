# T19 — M02 security review fixes

Implemented the T17 findings using ten new migrations (`20261011000012`–`20261011000021`), complete SQL function definitions, generated Supabase types, typed verification access and regression tests. Existing RPC signatures are unchanged; `registry_pending_verification(target_tenant_id)` is additive. No applied migration was edited, no remote database was changed and nothing was pushed.

## Finding → fix → commit → test

| Finding | Fix | Commit | Evidence |
|---|---|---|---|
| H1 | Approval creates a new person or attaches only the applicant's Auth-bound person; never overwrites an existing identity from request data; collisions return `identity_conflict`, keep the request pending and issue no invitation. | `a805468` | `registry_review_fixes.test.sql`: reviewer outsider submission, victim snapshot/no invitation, holder same-unit variant, Auth-bound applicant preservation; HTTP reviewer exploit. |
| M1 | Holder invitations exclude co-holders, other-unit/historical residents, bound users, differing recorded mailboxes, pending/expired-pending/accepted invitations; same-event pending delivery retry remains supported. | `a805468` | Dedicated co-holder, multi-unit, bound adult, mailbox, pending, expired and accepted lockout tests; existing onboarding/HTTP consent probes. |
| L1 | Holder lookup is unit-scoped; redacted identity claims auto-promote only without canonical collisions; plate claims return UUIDs uniformly, pending conflicts are registry-only and archived plates do not block verification. Holder projections hide canonical verification results. | `a805468` | Foreign document/email claims, queue denial/isolation, plate conflict/hidden column/archival, deterministic uniqueness-race fallback; existing tenant isolation suite. |
| L2 | Import self-role guard covers new residences and matches the caller's document, registry email or live verified Auth email. | `a805468` | Document-based new-unit self-holder preview/confirm denial; Auth-email self-holder preview denial. |
| L3 | Holders edit only their own created unbound members; cannot rewrite a bound adult, edit registry-created people or clear registry-recorded minority/birth date. | `a805468` | Bound adult, registry-created unbound person, registry-set minor flag and birthday boundary regression tests. |
| L4 | Enumerated approval/visit fallback reasons, five lookups/operator/15 minutes across tenants, and attributed PII-free audit for each released phone. | `a805468` | Invalid reason, five successful lookups, sixth null, persisted counter and five audit rows; existing foreign/support/role matrix. |
| L5 | Canonical bounded Storage paths, bounded text/row sizes, immediate confirmed staging purge, 24-hour preview expiry and owner-only purge job. | `a805468` | Traversal/extra-segment Storage denial and pet constraint; vehicle/unit/pet bounds; oversized unknown staging input; confirmed/expired PII purge and unauthorized job execution. |
| I1 | Failed-only tenant budget tightens a user's limit to one attempt and emits one abuse audit/window; a fresh user's first valid code still succeeds. | `a805468` | Threshold failure, tightened repeated user, unchanged tenant count on valid attempts, abuse audit and fresh-user success; existing HTTP persisted guessing tests. |
| I2 | Store formula-looking values as data; exported cells use `neutralizeSpreadsheetFormula`, and DB/UI/export notes state the requirement. | `a805468`, `cdbf3a1` | SQL formula preservation; fourteen helper unit cases covering formula prefixes, whitespace/control characters, apostrophes and ordinary text. |
| I3 | Corrected contract: guard role required, no gate assignment binding yet, archive leaves requests pending, registry profile rights unchanged. | `a805468` | Contract notes; existing role/support/gate/archive tests. |
| Missing tests 1–10 | All listed cases implemented; audit assertions use a repeatable-read baseline and actual pre-test event IDs; tenant attempt baselines account for expired windows. | `a805468` | 78 dedicated pgTAP assertions plus updated audit/backoffice/registry/contract/schema assertions. |
| UI context regression | Bound users always read their own person row, enabling the existing membership INNER JOIN; invitation consent settles only proven email claims, preserves collisions for review and leaves document claims unchanged. | `a805468` | Holder-created and approved-join acceptance → own person read → context join; conflicting document/email claims preserved; actual PostgREST embedded person join after acceptance. |

Before applying any T19 migration, the new reviewer exploit test failed on approval, victim preservation, invitation absence and pending status: the old function returned `approved` and changed the victim to the attacker's identity. After the fixes those exact assertions pass. Every pgTAP fixture rolls back; HTTP probes use fictional local fixtures.

## Decisions and integration

The coordinator approved claims with automatic collision-free canonical promotion and a uniform holder projection, and rejected tenant-wide valid-code lockout in favor of stricter per-user throttling plus abuse audit. The coordinator also required always-readable own profiles after the resident worker reproduced a context-loader regression; migration 21 addresses it without exposing other people's rows. Status messages announced every shared-stack migration application.

Registry conflict handling is explicit: `registry_pending_verification` lists unresolved people/vehicles; registry chooses the existing person/vehicle UUID and corrects the canonical conflict with `save_resident`/`save_vehicle`. Holders receive no target/unit collision details. Future gate consumers must use only active verified vehicles. `unit_sheet` is the uniform holder projection; own users retain direct reads for their context loader.

M05 still must bind backup contacts to an active approval/visit or gate session; interim enum reasons are attestations protected by rate limits/audit. The owner-only staging purge function exists but has no scheduler; a future job must invoke it for unattended expiry cleanup. Formula safety belongs at CSV/XLSX serialization, while UI renders stored values as text. UI workers own conflict/expiry labels and verification management; they were informed of these additive behaviors.

## Acceptance before coordinated fresh reset

| Check | Result |
|---|---|
| `pnpm supabase migration up` | PASS; migrations 12–21 applied locally without restarting services |
| `pnpm gen:types` | PASS; formatted generated output, no RPC signature changes |
| `pnpm test:db` | PASS; 1,046 assertions / 16 files, including 78 T19 assertions |
| `node --test supabase/probes/http-security.test.mjs` | PASS; 15 tests / 3 suites, including exploit and context embedding |
| Supabase local DB lint (`public,app_private`, error level) | PASS; no schema errors |
| `pnpm lint` | PASS; six tasks |
| `pnpm typecheck` | PASS; six tasks |
| `pnpm test` | PASS; 661 tests: domain 114, Supabase 41, web 450, observability 30, tokens 26 |
| Domain coverage | 100% statements/functions/lines; 98.25% branches; registry 100% in every category |
| Scale HTTP probe and fresh reset | Pending coordinated final window; no reset performed without authorization |

Runtime: Node 25.2.1, pnpm 11.11.0, Supabase CLI 2.120.0, PostgreSQL 17.11, PostgREST 16.4, Turborepo 2.11.7, Next.js 16.4.0, Vitest 4.1.11. Existing Vitest localstorage-file warnings remain nonfatal. No environment files or secrets are committed.
