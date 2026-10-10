# T20 — Holder ends a household membership

Implemented M02-F05 in additive migrations `20261011000022_end_household_membership.sql` and `20261011000023_end_household_membership_acl.sql`, generated database types and the typed `endHouseholdMembership` wrapper. Existing functions and applied migrations were left intact. No UI, identity validator or remote database changes were needed.

The RPC authorizes validated identities before any target or receipt lookup and limits target reads to writable registry tenants or holder units. It locks and rechecks an active household member, excludes every caller-owned membership and other roles, revokes the membership with an end timestamp, deletes its delegations and revokes pending invitations only for its person/unit. It preserves person identity, user binding, residence rows and all other memberships. Existing audit triggers capture membership/delegation/invitation changes and record the platform actor plus target-user attribution for support sessions. Support follows the bound target holder's rights; minority is allowed when ending an existing membership.

Retries use the existing serialized receipt mechanism, bound to tenant, target, actor and operation. Same-event retries return without repeating writes; changed actor/target, null events and all authorization failures use the same `42501 / Household membership management denied` response.

## Acceptance

| Check                        | Result                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `pnpm supabase migration up` | PASS; migrations 22 and 23 applied locally, announced before each application  |
| `pnpm gen:types`             | PASS; generated output formatted with the repository style                     |
| `pnpm test:db`               | PASS; 1,077 assertions / 17 files; 31 dedicated termination assertions         |
| `pnpm lint`                  | PASS; six tasks                                                                |
| `pnpm typecheck`             | PASS; six tasks                                                                |
| `pnpm test`                  | PASS; 662 tests: domain 114, Supabase 42, web 450, observability 30, tokens 26 |
| Domain coverage              | 100% statements, functions and lines; 98.25% branches                          |

Dedicated pgTAP coverage includes own-unit holder success, other unit and cross-tenant denial, a same-unit co-holder, self household/holder denial, admin/guard targets, registry success/isolation, minor termination, support binding and attribution, malformed support identity, suspended tenant, idempotency and changed-event actor/target, delegation removal, invitation scope, other membership preservation and unchanged identity/user binding. The wrapper test verifies the exact generated RPC arguments.

Initial schema guards exposed a PUBLIC execution grant remaining after the capability-owned function was created; migration 23 applies the ACL as the function owner. One full-suite retry hit a shared-stack deadlock in the preexisting registry review fixture while concurrent writes were active; after a coordinator status notice, subsequent full runs passed. No resets, restarts, scale probes or shared-server termination occurred.

Runtime: Node 25.2.1, pnpm 11.11.0, Supabase CLI 2.120.0, PostgreSQL 17.11, Turborepo 2.11.7 and Vitest 4.1.11. Existing Node localstorage-file warnings remain nonfatal. The coordinator owns integration/staging; nothing was pushed.
