# T10 — Security review of M01 (platform, invitations, subscriptions, impersonation)

Reviewer: independent agent, 2026-10-10. Scope on `main` (`96e8f23`): `supabase/migrations/20261010*.sql`,
`supabase/functions/**` (`send-invitation`, `support-session`, `_shared`), `supabase/tests/*.sql`,
`supabase/config.toml`, and the web MFA routing (`apps/web/src/proxy.ts`, `apps/web/src/lib/context/**`,
`apps/web/src/lib/auth/{mfa,redirect}.ts`, `packages/supabase/src/session.ts`, `/platform` layout, `/login/mfa` and
`/account/security` actions). I measured it against `AGENTS.md`, spec §5.2 / §6 / M01, D17 and D18, and
`reports/M01-db.md`.

Method: I read the code and dumped the **live** function bodies from the running local stack (`supabase_db_domus`,
all 8 migrations applied). Many M01 functions are produced by `replace()` on `pg_get_functiondef`, so the source
file isn't the definition that actually runs. I ran probes as `postgres` via `docker exec … psql`, each inside a
transaction that was **rolled back**. They impersonate users with `set local role authenticated` +
`request.jwt.claims`. I did not reset or stop anything. `pnpm test:db` passes: 6 files, **501 assertions**.

Limits:

- I did **not** run independent forged-support-token or Auth-endpoint HTTP probes. For impersonation I relied on code
  reading and on the existing pgTAP claim-mismatch matrix (listed under "Verified OK"). That suite passes and does
  exercise the validator.
- The shared DB also held two **uncommitted** functions from the T11 worktree (`current_user_cancelled_tenants`,
  `list_support_targets`). They are out of scope and additive, and none of my findings depend on them.

## Verdict: **approve with fixes** (H1 is a merge blocker for any real tenant)

The impersonation design is sound:

- Support tokens are bound to the tenant, the session row, the actor, the expiry, and the absence of an Auth
  session.
- Every identity helper goes through one validator.
- Suspended and cancelled states are enforced by both an always-on trigger and the helpers.
- The web guards rely on verified claims and are re-checked server-side.

One real escalation exists, though: **accepting an invitation can attach an admin membership and its permissions to a
different account than the one accepting it**. This lets a `registry`-only admin capture `admin_management`,
`access_audit`, `finance` and so on, which directly breaks D17. The cause is a silent mis-rewrite. The fragile
body-rewriting pattern behind it (M1) should be retired at the same time.

| #  | Severity | Title                                                                                                      |
| -- | -------- | ---------------------------------------------------------------------------------------------------------- |
| H1 | High     | `accept_invitation` lost its "person already bound" check; an admin invitation can be hijacked (D17)       |
| M1 | Medium   | Function bodies are patched with global `replace()` on `pg_get_functiondef`: silent over- and no-match    |
| M2 | Medium   | The email binding trusts `email_confirmed_at`, but signup with autoconfirm makes any unclaimed address "verified" |
| L1 | Low      | The support signing key is a project master key; "dedicated key" separates rotation, not privilege        |
| L2 | Low      | `create_invitation` accepts a client-chosen `token_hash` and expiry when called directly via PostgREST     |
| L3 | Low      | No code path revokes another actor's support session; `revoked` status is unreachable except by operator SQL |
| L4 | Low      | The invitation SELECT policy doesn't exclude support identities (invitee emails and token hashes visible) |
| L5 | Low      | Existing tenant members can't accept a person-less invitation; send-invitation re-mails on every retry    |

---

## High

### H1 — Accepting an invitation for an already-bound person attaches the grant to someone else

**Location:**

- `20261010000003_invitation_integrity.sql:84-92`: the `replace()` that inserts the constant-time hash check.
- The resulting live body of `public.accept_invitation(text)`, in the `else` branch after
  `update public.person set user_id=actor … and user_id is null`.

**Root cause:** Migration 0000 had `if not found then raise exception 'Invitation unavailable'` in **two** places:

1. after the invitation lookup;
2. after the `update person … where user_id is null`.

Migration 0003 rewrites that literal with `replace()`, and `replace()` substitutes **every** occurrence. The second
guard became `if not constant_time_hash_equal(target.hash, digest(token)) or target.invitation_id is null`, which is
always false at that point. The function therefore continues when the person row is **already bound to another
user**. It then:

- inserts the membership and permissions on that person, which means on the other user's account;
- marks the invitation accepted by the caller.

`create_invitation` only checks `person.user_id is null` at creation time, and nothing stops two pending invitations
from targeting the same person.

**Scenario (registry-only insider → full admin permissions):**

1. An `admin_management` admin invites an existing, unbound person P (from the padrón) to become an admin, for example
   `tenant_admin` with `access_audit`, `finance` and `admin_management`.
2. A malicious `registry`-only admin can't see admin invitations, but knows P is about to become an admin. They create
   their own invitation for **the same P** as `household_member`, which `registry` allows, addressed to a second email
   they control. They accept it first, which binds P to their alt account.
3. The real invitee accepts. They get a "successful" membership id, but the `tenant_admin` membership and every
   permission land on P, which is now the attacker's alt account. The real invitee gets nothing.

No malice is needed for the integrity failure: two invitations to the same person with different emails always hand
the second grant to the first acceptor. D17 says only `admin_management` may create administrators. Here a `registry`
holder ends up with `admin_management`.

**Evidence** (rolled-back transaction; user 2 = full admin, user 12 = `registry` only, `a1` = real invitee, `a2` =
attacker alt account):

```
registry sees admin invitations | 0                          -- step 2 is done blind, but succeeds
i1 (admin → P, tenant_admin, {access_audit,finance,admin_management}) created by user 2
i2 (registry → P, household_member, attacker.alt@…) created by user 12
accept_invitation(i2 token) as a2  -> b393864c-…               -- P.user_id := a2
accept_invitation(i1 token) as a1  -> 6aaabc2b-…               -- no error
legit admin perms   | audit {} | member {}                     -- real invitee has nothing
attacker perms      | audit {A} | admin_mgmt {A} | finance {A}
memberships on P: a2 tenant_admin {access_audit,finance,admin_management}; a2 household_member
invitations: both 'accepted'; legit row says accepted_by=a1, person_id=P (bound to a2)
```

**Fix:**

- Restore the bind guard: `get diagnostics`/`if not found` after the person update must raise the uniform error.
  Better, lock P first with `select … from person where … and user_id is null for update` and raise if absent.
- In `create_invitation`, reject a `target_person_id` that already has a **pending** invitation, or treat the
  invitation as invalid once P is bound.
- On successful acceptance, revoke other pending invitations for the same person.
- Add the test listed under "Missing tests" #1. The current suite (501 assertions) passes with this bug present.

---

## Medium

### M1 — `replace()`-based function rewriting is unsafe

**Location:**

- `20261010000000_platform_tenants.sql:420-427`: rewrites **every** postgres-owned public SECURITY DEFINER function.
- `20261010000001_platform_audit.sql:183-194`.
- `20261010000003_invitation_integrity.sql:84-92, 98-111, 113-118, 121-129`: `accept_invitation`,
  `start_support_session`, `create_invitation`, `revoke_invitation` and `audit_row_change`.

**Scenario:** `replace()` fails in two ways. It patches every match (H1), and it silently does nothing when the
pattern doesn't match because of whitespace, quoting or a previous rewrite. In both cases the migration "succeeds".
The function that actually runs can't be reviewed from source; reviewers must dump `pg_get_functiondef` (as I did).
The 0000 loop also re-executes every public definer function, including future ones if the pattern were reused.

**Evidence:**

- H1 is a direct product of this pattern.
- I confirmed the other intended edits did apply: `start_support_session` binds `support_session_started_at`, the
  `create_invitation` retry compares hash, email, role and permissions, and `audit_row_change` has the
  `support_session` target branch (all `t`).
- In `audit_row_change` itself: `delete_membership`, `revoke_membership`, `grant_/revoke_admin_permission` don't call
  `writable_permission_tenant_ids` directly. They are still read-only safe only because they go through the rewritten
  `lock_managed_membership` and the `enforce_tenant_writes` trigger. That holds by coincidence, not by construction.

**Fix:** In new migrations, use complete `create or replace function` bodies. Never use `replace()` on definitions.
Add per-behavior tests. A schema-guard test that searches live bodies for required fragments is a weak fallback.

### M2 — The "verified email" binding is only as strong as Auth's confirmation setting

**Location:**

- `config.toml:177, 222, 227`: `enable_signup = true`, `[auth.email] enable_confirmations = false`.
- `20261010000000_platform_tenants.sql:224-228`: `verified_email()` trusts `email_confirmed_at`.
- `runtime.ts:311-314`: same assumption.

**Scenario:** With confirmations off, Auth marks any self-signup address confirmed immediately. Anyone can therefore
register an address that has no account yet and satisfy `invitation_email = verified_email()`. The invitation token
remains the primary secret, so this is defence in depth. Still:

- A token that leaks through email forwarding, logs, the `?token=` query string or a Referer header becomes usable by
  whoever pre-registers the address.
- `inviteUserByEmail` pre-creates an **unconfirmed** user. How signup or OTP behaves against that pending account is
  then the only thing protecting it.

The report's claim that acceptance checks the "database-verified email" holds only when confirmations are on.

I did not probe this empirically. It is a configuration finding. The local setting is the Supabase default, and hosted
configuration is deferred (D19).

**Fix:**

- Add to the D19 hosted checklist: `enable_confirmations = true`; consider `enable_signup = false` (invite-only);
  `secure_password_change = true`.
- Optionally require acceptance from a session established by the invitation or OTP link (`amr` contains
  `invite`/`otp`/`magiclink`, or the session was created after the invitation).

---

## Low

### L1 — The support signing key is equivalent to the project's master signing key

**Location:** `runtime.ts:283-362`, `platform.ts:207-222`, and the "Impersonation mechanism" section of `M01-db.md`.

PostgREST, Storage and Realtime trust every key in the project JWKS for **any** claims. The DB validator only
activates when support claims are present. Whoever holds `DOMUS_SUPPORT_SIGNING_JWK` can therefore mint ordinary
tokens: any `sub`, `aal2`, even `role: service_role`. A "dedicated key distinct from normal Auth's" gives separate
rotation and revocation, **not** privilege separation.

The `kid` check compares only against the *caller's* token header, so it is a heuristic. Its exposure is comparable
to the service-role key already present in the Edge environment, which is why this is Low and not higher.

**Fix:**

- Document this secret as tier-0, the same as `service_role`.
- Prefer KMS/HSM-backed signing when available.
- Never log or return the JWK.
- Make rotation tests part of the D19 runbook.

### L2 — `create_invitation` trusts the caller's token hash and expiry

**Location:** `20261010000000_platform_tenants.sql:239-269`; execute is granted to `authenticated` (`:444-447`).

A tenant admin can skip `send-invitation` and call the RPC directly with the hash of a low-entropy token (for example
`repeat('a',64)`) and any expiry up to 7 days. The email binding and grantor rules still apply. However, the Edge
function's HMAC entropy and its "secret only in the email" property are not enforced by the database.

**Fix:** Generate the token inside the RPC (`gen_random_bytes(32)`), store only its hash, and return the token once to
the caller. Alternatively, expose a server-only creation path. Accept the remaining risk explicitly in the report.

### L3 — No revocation path for someone else's support session

**Location:** `20261010000000_platform_tenants.sql:368-378`.

`end_support_session` only ends the caller's own session (as actor or support identity). The `revoked` status is
never set by any code path, and another platform admin or the tenant's `access_audit` admin can't stop a session.
The emergency procedure in `M01-db.md` relies on operator SQL against the database.

**Fix:** Add an audited `revoke_support_session(id, reason)` for MFA platform admins. Decide (spec) whether the tenant
admin, who per D18 sees the session, may also revoke it.

### L4 — Support identities read the target's invitations

**Location:** `20261010000000_platform_tenants.sql:385-388`.

Unlike `support_session`, the invitation policy has no `not is_impersonating()` term. Support acting as an admin
therefore reads invitee emails and token hashes. That matches D18's "acts as the user", and the hashes are useless
without the preimage. It is noted because the report says support cannot touch invitations. Decide explicitly and add
the exclusion if desired.

### L5 — Invitation UX and abuse edges

- **Person-less invitations:** `accept_invitation` denies them whenever the caller already has a person row in the
  tenant (`20261010000000:312-314`). An existing resident can't be invited as an admin, which pushes operators toward
  workarounds such as H1-style person-targeted invitations.
- **Repeated email:** `send-invitation` re-sends the email on every retry with the same `client_event_id`
  (`platform.ts:96-107`). Only Auth's email rate limit applies.
- **Informational:** `constant_time_hash_equal` adds nothing, because the row is already selected by an indexed
  equality on the hash. It is harmless.

---

## Missing tests

1. **H1:** two pending invitations for the same person with different emails. The second acceptance must fail with
   the uniform error, and no membership may be attached to a user other than the caller.
2. **H1 variant:** an invitation for a person bound after creation, through another acceptance.
3. **M1:** behavior tests for every rewritten function. At minimum, assert the live `accept_invitation` contains
   exactly one hash-equality guard and one bind guard.
4. Accepting an invitation must revoke or invalidate other pending invitations for the same person (after the fix).
5. **Suspended tenant:** `create_invitation` and `revoke_invitation` by a tenant admin. The code is correct through
   `can_invite`, but it isn't tested directly.
6. **L2:** a direct `create_invitation` call with an out-of-range expiry and with a client-chosen hash (decide the
   policy first).
7. **L3 (after the fix):** a second platform admin revokes a live session; the token loses reads immediately.
8. **Edge (HTTP):** `send-invitation` and `support-session` called with a support token return 401/403 and send no
   mail. This is covered at the SQL level, not at the function level.

## Verified OK

**Identity choke point:**

- `current_identity_is_valid()` requires matching `sub`, `session_id = support_session_id`, the tenant claim, the
  actor claim, `aal1`, live status, both expiry bounds, an active actor, a non-platform target, and the absence of an
  `auth.sessions` row.
- All tenant-set helpers and `identity_tenant_ids()` consume it.
- The pgTAP matrix covers each of these and passes: forged tenant/actor/target/session claims, non-MFA actor,
  elevated `aal`, malformed claim, deactivated actor, promoted target, ended/expired/revoked session, Storage
  after end, shared user confined to the selected tenant, no nested sessions, no platform RPCs, no invitations.
- `identity_tenant_ids()` no longer reveals foreign tenant UUIDs to ordinary callers.

**Audit:**

- Support writes record the impersonator as actor, the target as `on_behalf_of`, and the session id. Lifecycle
  events carry actor, target and session.
- Invitation and support PII and token hashes are redacted.
- `audit_invitation_acceptance` is reachable only through the `invitation_acceptor` trigger `WHEN` clause.
- Clients can't assume `invitation_acceptor`, and the role has no `CREATE`.

**D17 at creation:**

- `registry` can't create `tenant_admin` invitations or read them (probe: 0 rows).
- Grantors can only grant permissions they hold and can't self-invite.
- A revoked grantor's pending invitations die (`invitation_grant_is_valid`).
- The retry key is bound to creator, tenant, email, role, permissions and hash.

**Tokens:**

- Invitation tokens are 256-bit HMAC hex, and only the SHA-256 hash is stored.
- Every failure path returns a uniform `42501 Invitation unavailable`.
- Acceptance re-evaluates `pending` under `FOR UPDATE` (no double accept).
- Expiry is at most 7 days.

**Subscription:**

- `enforce_tenant_writes` is `enable always` on `tenant`, `person`, `membership` and `membership_permission`.
- H0 management RPCs reject suspended callers through `lock_managed_membership` → `writable_permission_tenant_ids`
  (live bodies checked).
- Cancelled tenants are excluded from `member_tenant_ids()`, so data, audit, invitations, support lists and logos are
  denied (tested).
- No exemption hook exists yet. The comment forbids claim- or GUC-based exemptions.

**MFA:**

- Every platform RPC calls `is_platform_admin()`, which requires `aal2` from the signed JWT, an active row and no
  impersonation.
- `current_user_is_platform_admin()` reveals only the caller's own status and is false for support tokens.

**Web:**

- `getSessionIdentity` uses `getClaims()` (verified), not `getSession()`.
- The proxy and `/platform/layout.tsx` both require `aal2` plus an active platform row. Non-admins get a 404.
- `next` is sanitized by `safeNextPath` (blocks `//`, `/\`, schemes and control characters).
- Tenant and role headers are stripped from client input.
- MFA actions only act on the user's own factors.

**Edge:**

- `Cache-Control: no-store` is set, and CORS is restricted to the app origin.
- RPCs run as the caller, never as service.
- The service client is used only for `inviteUserByEmail`.
- The invitation is created before any mail is sent.
- The redirect is built from `DOMUS_APP_URL`, with no user-controlled redirect.
- The HS256 fallback requires `DOMUS_ENVIRONMENT=local` and an exact local URL, so it is unreachable on hosted URLs
  (unit-tested).
- No secrets are committed.

**Storage and Realtime:**

- The `tenant-logo` bucket is private and path-scoped to the tenant UUID. Only MFA platform admins write; members and
  support for that tenant read.
- No new Realtime publication.
