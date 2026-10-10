# T6 — Security review of T2 (M00-F05 / M00-F06 multitenant schema, RLS, audit)

Reviewer: independent agent, 2026-10-09. Scope: `supabase/migrations/20261009000000_multitenant_base.sql`,
`supabase/migrations/20261009000001_append_only_audit.sql`, `supabase/tests/*.sql`, `supabase/seed.sql`,
`reports/M00-F05-F06.md`, measured against `AGENTS.md` and spec §5.2 (S1, S3, S5, S7, S8), §6, §8.3 and §12.

Method: I read the code, then ran probes against the running local stack (`supabase_db_domus`, both migrations applied,
function bodies identical to the branch). I ran every probe as `postgres` via `docker exec … psql`. Each one was inside a
transaction that was rolled back, and it impersonated users with `set local role authenticated` +
`request.jwt.claims`. I did not reset or stop anything. `pnpm test:db` passes: 5 files, 184 assertions.

## Verdict: **approve with fixes**

Tenant isolation holds. In every probe, a user from tenant A could not read or write tenant B rows. The membership
validity rules are applied the same way in all four helpers, and `anon` gets nothing. Within a tenant, though, the
**`registry` permission works as full tenant admin**. A holder can grant themselves every other permission, promote
anyone to `tenant_admin`, and rebind identities, so the granular-permission model in §6.3 has no effect (H1). Fix H1
and the Medium items before M01/M02 build on this schema. The Low items can be scheduled.

| #     | Severity | Title                                                                                                          |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------- |
| H1    | High     | A `registry` admin can self-escalate to every admin permission (and promote others)                            |
| M1    | Medium   | A `registry` admin can bind or rebind any Auth user to a person, without consent and across tenants            |
| M2    | Medium   | Platform admin has standing, unaudited-read access to all tenants' personal data (S8 says "exceptional")       |
| M3    | Medium   | A SECURITY DEFINER BEFORE trigger runs before RLS: cross-tenant oracle and row lock for any authenticated user |
| M4    | Medium   | Policies call SECURITY DEFINER helpers per row over a full-table seq scan of all tenants                       |
| M5    | Medium   | Audit diffs keep full PII forever; the append-only trigger leaves no path for the §12 retention purge          |
| L1    | Low      | `alter default privileges in schema app_private revoke … from public` does nothing                             |
| L2    | Low      | `service_role` can TRUNCATE audited tables without an audit record; its writes have no actor                   |
| L3    | Low      | The owner can bypass audit immutability with `session_replication_role = replica`                              |
| L4    | Low      | Guards read all PII of every person in the tenant, including people with no membership                         |
| L5    | Low      | A `tenant_settings` admin can change `tenant_slug`; subscription protection depends on `current_user`          |
| L6    | Low      | A tenant admin without `registry` can't read their own permission rows                                         |
| L7    | Low      | `protect_audit_event` accepts any insert at `pg_trigger_depth() > 1`                                           |
| N1–N2 | Naming   | `audit_event_action` is text + check instead of an enum; `person_document_type` is free text                   |

---

## High

### H1 — A `registry` admin can self-escalate to every admin permission

**Location:** `20261009000000_multitenant_base.sql:230-239` (generic `registry` INSERT/UPDATE/DELETE policies applied
to `membership` and `membership_permission`), `:129-155` (triggers only check role consistency, not who grants what).

**Scenario:** The tenant gives an employee only `registry` (padrón) so they can maintain residents. That employee can:

1. Insert `membership_permission` rows on **their own** membership for `access_audit`, `tenant_settings`, `finance`,
   `guards` and the rest, which gives them full tenant-admin power.
2. Run `update membership set membership_role = 'tenant_admin'` on any member (for example a guard), then grant that
   member permissions.
3. Run `update membership set person_id = …` to move the first admin's all-permissions membership to a person they
   control. `membership.person_id` is not immutable. `maintain_row_metadata` only freezes the PK and `tenant_id`.
4. Revoke, suspend or delete the other admins' memberships and permissions, which locks them out.

§6.3 defines permissions as granted "per person". If `registry` implies "can grant any permission", the other eight
permissions add no security.

**Evidence** (admin user 2 reduced to `registry` only):

```
before: access_audit=false tenant_settings=false audit rows visible=0
INSERT 0 4                                   -- self-grant access_audit, tenant_settings, finance, guards
after:  access_audit=true  tenant_settings=true  audit rows visible=32
update membership set membership_role='tenant_admin' where membership_id='…03'  -> UPDATE 1 (guard promoted)
insert membership_permission (…03,'tenant_settings')                             -> INSERT 0 1
update membership set person_id='…04' where membership_id='…02'                  -> UPDATE 1
user 4 (unit holder) now tenant_settings=true
```

**Fix:** Move admin-permission and admin-role management out of the generic `registry` policies.

- Allow no direct client writes to `membership_permission`. Use a SECURITY DEFINER RPC (for example
  `grant_admin_permission` / `revoke_admin_permission`) that enforces three rules: the caller holds a dedicated
  management capability, the caller can't target a membership whose person is bound to `auth.uid()`, and a grantor can
  only grant permissions they hold themselves.
- In the `membership` policies, a `registry` admin can't create or update a row where `membership_role = 'tenant_admin'`
  (add it to the `WITH CHECK`/`USING` clauses, or use a trigger) and can't modify their own memberships.
- Make `membership.person_id` and `membership_permission.membership_id` immutable (extend `maintain_row_metadata` or
  add a trigger).

**Spec gap to resolve:** §6.3 doesn't say who may grant admin permissions. Options: only admins holding all
permissions, a new `admin_management` permission (needs a `GLOSSARY.md` entry), or the platform admin. **This needs a
product decision.** Whichever option is chosen, self-grant must be impossible.

---

## Medium

### M1 — A `registry` admin can bind or rebind any Auth user to a person

**Location:** `20261009000000_multitenant_base.sql:40` (`person.user_id` writable), `:234-235` (insert/update policies
put no restriction on `user_id`), `:158-175` (doesn't freeze `user_id`).

**Scenario:** A `registry` admin of tenant A sets `person.user_id` to any Auth user UUID, including a user who belongs
only to tenant B. They then give that person an active membership. The victim gains a tenant-A membership they never
accepted, and the binding becomes A's audit attribution for that account. Rebinding an existing person's `user_id` to
a second account the admin controls is another H1 escalation path. Insert errors also act as an existence oracle for
Auth user UUIDs: `23503` when the user doesn't exist, success when it does. Spec M02-F04 says the resident **accepts**
an invitation.

**Evidence:** `update person set user_id='…09' (Tipas user) where person_id='…05' (Ceibos)` → `UPDATE 1`. Afterwards,
Tipas user 9 → `reads Ceibos tenant rows=1`.

**Fix:** Revoke `insert (user_id)` / `update (user_id)` from `authenticated` with column privileges, or add a trigger
that rejects changes to a non-null `user_id` from client roles. Set the binding only through an
invitation-acceptance RPC in which `auth.uid()` binds **itself** (M02-F04).

### M2 — Platform admin has standing, unaudited-read access to all tenants' data

**Location:** `20261009000000_multitenant_base.sql:220-239` (the `is_platform_admin()` branch on every person,
membership and permission policy), `20261009000001_append_only_audit.sql:26-27`.

**Scenario:** S8 and M01-F04 call for **exceptional** access to tenant data, audited, with a reason and a duration, and
visible to the tenant admin. The §6.4 matrix gives the super-admin "—" for padrón. In this schema, any platform-admin
session at `aal2` reads every person (DNI, phone, birth date) in every tenant and can write registry data in any tenant.
Reads leave no trace. One stolen aal2 session therefore exposes the whole platform.

**Evidence:** at `aal2`, user 1 sees `persons_all_tenants=10, tenants=2`. `update person … where person_id='…08'`
(Tipas) → `UPDATE 1`.

**Fix:** Before real data, limit the standing platform-admin branch to `tenant` and `platform_admin`. Grant access to
tenant data through a `support_access_grant` row (tenant, platform admin, reason, `expires_at`, created by an RPC that
writes an audit event) checked by a helper, as planned in M01-F04. The author's report defers this workflow to M01.
That deferral is acceptable for H0 only if it is tracked as a **blocker for the pilot**.

### M3 — SECURITY DEFINER BEFORE trigger runs before RLS (oracle and row lock)

**Location:** `20261009000000_multitenant_base.sql:129-142` (`validate_admin_permission`, `security definer`,
`perform … for update`).

**Scenario:** PostgreSQL fires BEFORE ROW triggers **before** it checks the RLS `WITH CHECK`. Any authenticated user can
attempt `insert into membership_permission (tenant_id=<B>, membership_id=<X>)`, even with no membership anywhere. The
trigger then runs as owner, takes `FOR UPDATE` on tenant B's membership row, and returns a different error depending on
B's data:

- `42501` (RLS): X is a `tenant_admin` membership of B.
- `23514`: X isn't a tenant-admin membership, or doesn't exist.

That is a cross-tenant information channel (which membership UUIDs are admins) and a way to lock rows across tenants.
Exploitation needs the UUIDs, which limits it today. The bigger risk is the pattern: M04/M05 tables will copy it, and
there the leaked facts matter more.

**Evidence** (user `…ff`, no memberships):

```
(tenant B, membership 06 = admin)       -> ERROR 42501 new row violates row-level security policy
(tenant B, membership 07 = guard)       -> ERROR 23514 Permissions require a tenant admin membership
(tenant B, membership 99 = nonexistent) -> ERROR 23514 Permissions require a tenant admin membership
```

**Fix:** Start every SECURITY DEFINER trigger with an authorization guard (`if not (select
app_private.is_platform_admin()) and not app_private.has_admin_permission(new.tenant_id, 'registry') then raise …
'42501'`). Alternatively, make it SECURITY INVOKER: the lock then goes through RLS, and outsiders get the same "not
found" result in every case. Add a rule to `AGENTS.md`: "SECURITY DEFINER triggers authorize the caller before touching
other rows." `protect_membership_role` (`:143-155`) is less exposed because UPDATE filters through `USING` first, but
it should follow the same rule.

### M4 — Policies call helpers per row over every tenant's rows

**Location:** every tenant policy, for example `20261009000000_multitenant_base.sql:201-202, 220-228, 234-236`,
`20261009000001_append_only_audit.sql:26-27`.

**Scenario:** `app_private.has_admin_permission(tenant_id, …)`, `has_tenant_role(tenant_id, …)` and
`is_tenant_member(tenant_id)` take a row column as input, so the planner can't hoist them. They are also SECURITY
DEFINER, so they can't be inlined, and the policies give no indexable `tenant_id` predicate. Every query
therefore seq-scans the **whole table across all tenants** and runs up to two 3-table helper queries per row. Cost
grows with platform-wide row count. This hits hardest on `audit_event` and future `movement` tables.

**Evidence** (registry admin, `explain select * from person`):

```
Seq Scan on person
  Filter: ((InitPlan 1).col1 OR app_private.has_admin_permission(tenant_id, 'registry') OR
           app_private.has_tenant_role(tenant_id, '{guard}') OR (ANY (person_id = (hashed SubPlan 2).col1)))
```

**Fix:** Add set-returning helpers that are evaluated once per statement, and write policies as `tenant_id in (select
app_private.permission_tenant_ids('registry'))`, `tenant_id in (select app_private.role_tenant_ids('{guard}'))` and
`tenant_id in (select app_private.member_tenant_ids())`. This produces a hashed subplan and lets the planner use the
`tenant_id` index. Set this pattern now, before M02+ copies the current one.

### M5 — Audit diffs keep full PII forever, with no sanctioned purge path

**Location:** `20261009000001_append_only_audit.sql:64-70` (full row on insert/delete), `:29-41` (rejects every
DELETE, including the owner's).

**Scenario:** Every `person` insert, update and delete copies DNI, phone and birth date into `audit_event_diff`. §12
sets audit retention to 1 year and plans a daily `pg_cron` purge. Ley 25.326 deletion and rectification requests also
apply. The trigger blocks all DELETEs, including the owner's, so a compliant purge can only work by disabling the
trigger (see L3). PII also spreads to everyone with `access_audit`.

**Evidence:** an insert by a `registry` admin produced a diff of `{"person_phone": "+54 381 555 0100",
"person_birth_date": "1990-05-01", "person_document_number": "12345678", …}`.

**Fix:**

1. Add a per-table redaction list in `audit_row_change`: record that a sensitive column changed (or a salted hash of it)
   and leave out the value.
2. Add one sanctioned `app_private.purge_audit_events(before timestamptz)` that `protect_audit_event` recognizes. For
   example, `protect_audit_event` allows DELETE only when `current_user` is a dedicated NOLOGIN purge role that owns
   the function. A GUC flag would not work because clients can set GUCs. The function writes a purge-volume audit
   event, as §12 requires.

---

## Low

### L1 — Schema-scoped default privileges can't revoke PUBLIC execute

**Location:** `20261009000000_multitenant_base.sql:245`. Per-schema default privileges can only **add** to the global
defaults, so the `revoke … from public` at this line does nothing.

**Evidence:** `create function app_private.zz_probe()` → `proacl` is null (PUBLIC execute), and
`has_function_privilege('authenticated', …)` returns `true`.

**Impact:** Any future `app_private` function, including SECURITY DEFINER ones, is executable by `authenticated`, who
has `USAGE` on the schema. PostgREST doesn't expose `app_private`, so exploiting this needs another SQL entry point.
Still, the protection the migration states isn't real.

**Fix:** `alter default privileges for role postgres revoke execute on functions from public;` (global), then keep the
explicit grants. Add a schema-guard test that no `app_private` function has a null `proacl` or PUBLIC execute.

### L2 — `service_role` can TRUNCATE audited tables; its writes have no actor

**Location:** grants come from Supabase default privileges; the migrations only revoke from `public`, `anon` and
`authenticated` (`:194`, audit `:24`).

**Evidence:**

- `service_role` holds `DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE` on every table.
- `truncate public.membership_permission` deleted 18 rows and produced `audit_events_for_truncate = 0`.
- An insert by `service_role` is audited with a null `audit_event_actor_user_id` and a null actor person.

The trigger still blocks `service_role` from writing to `audit_event`.

**Fix:**

- `revoke truncate, trigger, references on <audited tables> from service_role`.
- Add an `audit_event_db_role` (`current_user`) column. When Edge Functions act for a user, pass the acting user so the
  actor is recorded. §8.3 already requires Edge Functions to validate that requester.

### L3 — The owner can bypass audit immutability

**Location:** `20261009000001_append_only_audit.sql:38-41`.

**Evidence:** as `postgres`, `set local session_replication_role = replica; delete from audit_event … limit 1` →
`DELETE 1`. `alter table … disable trigger protect_audit_event` gives the same result.

The author's report acknowledges owner DDL, but `session_replication_role` needs no DDL. Every `pg_cron` job also runs
as `postgres`.

**Fix:** `alter table public.audit_event enable always trigger protect_audit_event` (and the truncate trigger), so
replica mode no longer skips them. Limit who holds `postgres` credentials. Hash-chaining or periodic export can come
later.

### L4 — Guards read all PII of every person in the tenant

**Location:** `20261009000000_multitenant_base.sql:220-223`.

A guard reads `person_document_number`, `person_phone` and `person_birth_date` for every person in the tenant,
including people with no membership or an expired one.

**Evidence:** a guard sees the `No Membership` person, with `+54 1` and `1980-01-01`.

§12 says "la guardia ve lo necesario para operar". The author's report flags this as an interpretation.

**Fix:** Before the pilot, replace the broad guard SELECT with a minimal projection (security-barrier view or RPC),
designed with M05.

### L5 — `tenant_settings` admins can rename `tenant_slug`

**Location:** `20261009000000_multitenant_base.sql:176-187, 205-207`.

**Evidence:** `update tenant set tenant_slug='las-tipas-old'` → `UPDATE 1`.

**Impact:** A tenant admin can change the slug, a platform-level routing identity, including to a confusable name.
Subscription-status protection relies on `current_user in ('authenticated','anon')`. Any future SECURITY DEFINER
function that updates `tenant` would skip that check without anyone noticing.

**Fix:** Use column-level `grant update (tenant_name, tenant_address, tenant_settings, tenant_logo_path,
tenant_time_zone)`. Change slug and subscription status only through a platform-admin RPC.

### L6 — A tenant admin without `registry` can't read their own permissions

**Location:** `20261009000000_multitenant_base.sql:227-228`.

**Evidence:** an admin without `registry` sees `own_permission_rows_visible = 0`.

The UI can't tell which admin sections to show, which pushes developers toward `service_role` or a broader policy.

**Fix:** Add the policy `"members can read own permissions"` using `membership_id` in the caller's active memberships.

### L7 — The audit insert guard trusts any nested trigger

**Location:** `20261009000001_append_only_audit.sql:32-33`.

`pg_trigger_depth() > 1` accepts inserts from **any** trigger. If someone later adds a trigger that inserts into
`audit_event` with caller-influenced values, or an owner-created trigger does, forged events would be accepted.

**Fix:** Make `audit_row_change` owned by a dedicated NOLOGIN `audit_writer` role, grant INSERT only to that role, and
have `protect_audit_event` check `current_user = 'audit_writer'`.

**Informational:**

- `x-forwarded-for` is client-controlled and may hold a list; store only the trusted hop.
- Subscription status `suspended` has no effect on RLS yet (M01-F02).

## Naming (AGENTS.md)

- **N1:** `audit_event.audit_event_action` is `text` with a check constraint. Rule 8 calls for a Postgres enum
  `audit_event_action` (`insert`/`update`/`delete`), added to `GLOSSARY.md`.
- **N2:** `person.person_document_type` is free `text`. The `_type` suffix and rule 8 suggest an enum (`dni`,
  `passport`, …), which would also keep the `(tenant, type, number)` uniqueness meaningful (`DNI` ≠ `dni` today).

No other clear violations: tables, PKs, prefixes, role FKs (`audit_event_actor_person_id`) and index/constraint names
follow the rules.

## Missing tests

1. **Self-escalation:** a `registry`-only admin inserting `access_audit`/`tenant_settings` on their own membership; a
   `registry` admin promoting a member to `tenant_admin`. These should fail once H1 is fixed.
2. **Identity rebinding:** updating `membership.person_id`, `membership_permission.membership_id` and `person.user_id`
   (H1, M1).
3. **Pre-RLS oracle:** an outsider inserting into another tenant's `membership_permission` must get the same error
   whether or not the target is an admin membership (M3).
4. **Immutability:** `tenant_id`/PK immutability is tested only on `person`. Add tests for `membership`,
   `membership_permission` and `tenant`.
5. **Writes by non-admins:** guard and resident UPDATE/DELETE on `person`, `membership` and `membership_permission`, in
   their own tenant and in the other one. Only guard INSERT is tested. Also a resident editing their own membership's
   status or validity. My probe returned 0 rows (OK), but the suite doesn't cover it.
6. **Role scoped to one tenant:** an admin in A who is a plain member in B can't write B. My probe passed (`42501`, 0
   rows), but the suite doesn't cover it, and seeded user 10 is a unit holder in both tenants.
7. **Mixed memberships:** an active `guard` membership plus a suspended `tenant_admin` membership that has permissions
   → no admin permission.
8. **MFA edge cases:**
   - A non-platform user with `aal2` can't insert `platform_admin` (my probe got `42501`, OK).
   - A platform admin at `aal1` can't UPDATE/DELETE `tenant` or write `platform_admin`.
9. **Audit:**
   - An admin with other permissions but **not** `access_audit` sees 0 events. Only a guard is tested.
   - Tenant audit readers can't see `tenant_id is null` events (my probe: 0, OK).
   - Actor attribution for `service_role` writes, and TRUNCATE by `service_role` (L2).
   - Tenant DELETE is audited.
10. **Default privileges:** no `app_private` function has PUBLIC/`authenticated` execute unless it is on the allowlist
    (L1).
11. **Weak schema-guard assertions:**
    - The FK-index check uses array containment (`@>`), so it doesn't check that the FK columns are the index
      **prefix** in order. Compare `indkey[0:n-1] = conkey` with order.
    - "Every table with tenant_id has policies" passes for a single `using (true)` policy. Add a check that every
      policy on a `tenant_id` table references an `app_private` helper or `tenant_id`.
12. **What the negative tests prove:**
    - Cross-tenant "cannot read" checks pass by default-deny even if a policy is dropped. The positive tests (lines
      26-29, 41-61) partly cover this.
    - Isolation line 19 (`42501`) passes only because RLS fires before the unique constraint; with no `WITH CHECK` it
      would return `23505`, not succeed. Use a permission that membership 06 doesn't already have, so the test proves
      the policy.

## Verified OK

- **RLS and grants:** RLS is enabled on all 6 tables. `anon` has no table privileges, no `app_private` usage and no
  helper execute. There are no `public` functions, so the RPC surface is empty, and no table is in a Realtime
  publication. `config.toml` exposes only `public` and `graphql_public`.
- **Helpers:**
  - All 5 auth helpers and all SECURITY DEFINER triggers have `search_path=""` and fully qualified names. There is no
    runtime dynamic SQL; the migration's `format(%I)` loops use constant arrays.
  - Trigger functions aren't executable by `authenticated`; only the 5 helpers are granted.
  - `auth.uid()`/`auth.jwt()` are wrapped in scalar subqueries.
- **Membership validity:** active status and `valid_from <= now() < valid_to` are applied the same way in all helpers.
  Expired, suspended, revoked, future and upper-boundary memberships grant nothing (suite plus code reading).
  `has_admin_permission` binds the permission to the same active `tenant_admin` membership.
- **Cross-tenant writes:**
  - Inserts, updates and deletes are rejected in every direction.
  - `tenant_id` and the PK are immutable.
  - Composite FKs (`membership → person`, `membership_permission → membership`) stop cross-tenant references.
  - An admin in A who is a member in B can't write B (probe).
- **Platform admin / MFA:**
  - Requires both an active `platform_admin` row and a signed `aal = aal2`.
  - A non-platform `aal2` user can't create a `platform_admin` row.
  - An inactive record grants nothing.
  - `tenant_settings` admins can't change `tenant_subscription_status`.
- **Residents:** can't modify their own membership (role, validity) or person row (probe: 0 rows).
- **Audit:**
  - Clients hold SELECT only.
  - UPDATE, DELETE, TRUNCATE and direct INSERT are rejected for `authenticated`, `service_role` and normal owner DML.
  - The actor comes from `auth.uid()`; the actor person is resolved inside the affected tenant.
  - Update diffs contain only changed keys; no-op updates emit nothing.
  - Events are written in the same transaction as the change.
  - Platform events (`tenant_id is null`) are hidden from tenant audit readers.
- **Indexes:** every FK and `tenant_id` has a covering index. Helper lookups use `person_user_id_idx` and
  `membership_tenant_id_person_id_idx`.
- **Suite:** `pnpm test:db` passes (184 assertions). Fixtures are fictional; the seed is local-only.
