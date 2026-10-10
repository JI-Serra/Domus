# M01 database, invitations and impersonation — T8

Implemented locally on 2026-10-10 on `JI-Serra/h1-t8-platform-db`. H0 migrations remain frozen. No remote database, hosting, web UI or UI-token changes were made. The coordinator approved the impersonation design through Orca `ask` before implementation and requested the separate caller-status RPC for T9.

## Acceptance

| Check                                | Result                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm supabase db reset`             | PASS: two frozen H0 migrations, six new M01 migrations and both fictional tenants                                           |
| `pnpm test:db`                       | PASS: **501 assertions** across six files (60 audit, 31 constraints, 219 isolation, 119 platform, 71 schema guard, 1 smoke) |
| `pnpm gen:types`                     | PASS: generated Supabase types, formatted with repository Prettier                                                          |
| `pnpm exec supabase db lint --local` | PASS: no issues                                                                                                             |
| `pnpm lint` / `pnpm typecheck`       | PASS: six tasks each                                                                                                        |
| `pnpm test`                          | PASS: 278 tests across domain, Supabase, web, observability and UI tokens                                                   |
| Function tests                       | PASS: 11 Vitest tests for shared Edge logic and reporting-bundle consistency, plus the live HTTP exercise below             |
| Domain coverage                      | 100% statements/functions/lines, 96.49% branches; new platform schemas 100%                                                 |
| Direct unauthenticated Edge probes   | `send-invitation`: 401; `support-session`: 403; no mail or session created                                                  |

Versions: Node 25.2.1, pnpm 11.11.0, Turbo 2.11.7, Supabase CLI 2.120.0, PostgreSQL 17.11, Auth 2.197.0, Storage 1.79.36, Edge Runtime 1.77.4 / Deno compatibility 2.1.4, supabase-js 2.117.3, jose 6.2.2. The package's installed Turbo documentation was consulted before adding package-scoped inputs that invalidate cached tests when Edge or reporting sources change.

## Database and authorization

New tables are `invitation` and `support_session`; both have RLS, tenant-leading indexes, indexed foreign keys, immutable row identity, maintained timestamps, declared audit redactions and no direct client DML. Invitations reference people through `(tenant_id, person_id)`. Support targets reference `(tenant_id, user_id)` on `person`, so a target cannot belong solely to another tenant. The `invitation_acceptor` role is NOLOGIN/NOINHERIT, is not assumable by client/service roles and has no schema CREATE privilege. Its narrowly exposed consent RPC binds identity and creates roles/permissions atomically. Conditional audit triggers recognize that exclusive capability without letting the caller manufacture audit events or privileged request roles.

Invitations store normalized email, an unclaimed target person or first/last-name data, role, permission snapshot, SHA256 token hash, expiry, status, creator, acceptance metadata and unique `client_event_id`. Acceptance checks the authenticated user's **database-verified email**, pending status, expiry, current grantor authority and tenant availability before binding. A token is consumed under a row lock and same-user/tenant advisory lock. Missing, expired, revoked, replayed, wrong-email and invalid-identity requests all return `42501 / Invitation unavailable`. Hash comparison performs all 64 comparison steps, including a dummy comparison when lookup fails; raw secrets are never compared or persisted. Existing linked-person role changes retain the H0 management RPCs; invitations bind unclaimed identities.

D17 applies at invitation creation and acceptance: `admin_management` manages administrative roles; `registry` manages other roles; a tenant grantor can only grant held permissions, cannot invite themself, and loses pending invitation authority when their membership/permission is revoked. The platform email function grants its first-admin invitations all ten permissions. Retry keys bind the invitation to its creator, tenant, recipient, role and permission snapshot; retries reuse the same opaque HMAC-derived token and never extend its stored expiry.

`app_private.current_identity_is_valid()` is the single identity validator. All tenant membership/role/permission/own-person/own-membership sets consume it through `current_user_id()`. H0 exposed RPCs were upgraded in **new migrations** to consume central identity helpers and reject suspended management authority before target lookup/locking. Client policies continue to use uncorrelated set-returning helpers. The identity-tenant helper itself returns only authorized tenant IDs for ordinary callers, avoiding even foreign UUID disclosure through direct helper use. Tests reject direct `auth.uid()`/`auth.jwt()` references in exposed application definers or public/Storage policies. Future application policies and RPCs must follow this pattern.

Audit remains append-only under the existing dedicated writer/purger roles. Added `audit_event_on_behalf_of_user_id` and `support_session_id`; support writes and lifecycle events carry the real platform actor, target and session reference. New redactions cover invitation email/names/token hash and support reason, while the original reason remains available to authorized tenant audit readers in `support_session`. Audit references intentionally have no deletion-sensitive FK, preserving durable history. No new Realtime publication was added; future Realtime tenant policies must consume the same identity sets.

## Subscription and billing criteria

| Status            | Tenant-user reads                                                           | Tenant-user writes                                                                           |
| ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pilot`, `active` | Normal membership/role policies                                             | Normal permissions                                                                           |
| `suspended`       | Normal policies, including status for the UI banner                         | Rejected, including existing membership/permission management RPCs and invitation acceptance |
| `cancelled`       | Denied, including audit, invitations, support-session lists and logo access | Denied                                                                                       |

Ordinary MFA platform management retains tenant metadata and audit access, including cancelled tenants. It retains no standing registry access; support acts with the target's permissions and subscription restrictions. Ending one's own support session is an exceptional security cleanup action and remains available while the target tenant is read-only.

`tenant_billable_unit_statuses unit_status[]` is a nonempty set of `occupied`, `under_construction`, `vacant`; defaults include all three. The spec does not define a commercial default, so H2 should confirm this setting when introducing the count. Duplicate/null/unknown values are rejected. A tenant-settings admin can update this typed field when writes are allowed. No unit count is implemented, as required by D20.

The private `tenant-logo` bucket accepts PNG/JPEG/WebP up to 2 MiB. Object paths are `<tenant UUID>/<filename>`. MFA platform admins upload/update/delete; active members read. Impersonated and revoked Storage tokens use the same tenant-set validator. Upload using authenticated Storage requests; signed download URLs are bearer capabilities and cannot themselves be revalidated after issue.

M05 exemption contract: `tenant_allows_writes(tenant_id)` is the common hook; no gate exemption exists in H1. Introduce a dedicated NOLOGIN gate-operation role, an authorized audited SQL/Edge entry point and an explicit **table-specific** exemption in the write trigger. Exempt only the gate operation for suspended tenants, retain membership/tenant isolation and cancelled lockout, and add isolation/read-only tests. Never exempt writes using a caller claim or `set_config` flag.

## Public RPC contract

All RPCs use the authenticated caller's token and generated `Database` types. New management RPCs are revoked from `anon`, PUBLIC and `service_role`; the email function invokes them as the **caller**, never as the service client. Send a stable UUID `client_event_id` for retryable creation.

```sql
create_tenant(
  tenant_name text, tenant_slug text, tenant_address text = null,
  tenant_time_zone text = 'America/Argentina/Tucuman',
  tenant_subscription_status tenant_subscription_status = 'pilot',
  tenant_logo_path text = null, client_event_id uuid = gen_random_uuid()
) returns uuid

current_user_is_platform_admin() returns boolean

create_invitation(
  target_tenant_id uuid, invited_email text, target_role membership_role,
  token_hash text, expires_at timestamptz, client_event_id uuid,
  target_person_id uuid = null, first_name text = null, last_name text = null,
  admin_permissions admin_permission[] = '{}'
) returns uuid

accept_invitation(token text) returns uuid -- created membership_id
revoke_invitation(target_invitation_id uuid) returns void

start_support_session(
  target_tenant_id uuid, target_user_id uuid, reason text,
  client_event_id uuid, duration_minutes integer = 30
) returns support_session
end_support_session(target_support_session_id uuid) returns void
```

`create_tenant` requires MFA platform authority and validates name, English slug, IANA zone and tenant-scoped logo path. Its tenant UUID is the onboarding event UUID, also recorded in a separate unique retry column. Defaults are `locale=es-AR`, `currency=ARS` and the typed billable set. A retry must keep the same tenant name/slug. Create the tenant first, then upload its logo and set `tenant_logo_path`, or supply the future `<client_event_id>/...` path during onboarding.

`current_user_is_platform_admin()` is **routing only**: true for an active platform administrator at AAL1 or AAL2, false for ordinary users and support tokens, denied for anonymous users. It is deliberately not an authorization primitive. Existing `update_tenant_platform_settings(target_tenant_id, new_slug, new_subscription_status)` remains the MFA RPC for subscription changes. Other H0 signatures remain as documented in `M00-F05-F06.md`.

| SQLSTATE                  | Meaning                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `42501`                   | Permission, MFA, read-only, identity or invitation denial; invitation acceptance uses the uniform message above |
| `22023`                   | Invalid onboarding/support input or conflicting onboarding retry key                                            |
| `55000`                   | Actor already has an active support session                                                                     |
| `23503`, `23514`, `23505` | FK/check/unique integrity; acceptance converts relevant integrity failures to the uniform denial                |

Typed wrappers are exported from `@domus/supabase/platform`. Input schemas are exported from `@domus/domain/platform`. Rows preserve generated DB column names. Query support-session lists directly with an explicit tenant predicate; `access_audit` authorizes the list, including actor/target IDs, reason, timestamps and requested duration.

## Edge endpoints and UI flow

`POST /functions/v1/send-invitation` accepts `target_tenant_id`, `invited_email`, `target_role`, `client_event_id`, plus `target_person_id` or `first_name`/`last_name`, and optional `admin_permissions`. It verifies the authenticated user, creates the invitation through caller-bound SQL, then uses server-only Auth administration to invite a new user. Existing users receive `signInWithOtp(shouldCreateUser=false)`. The redirect is `/invitations/accept?token=<opaque secret>`. Response: `{ invitation_id }`; the raw secret is delivered only in the email.

After Supabase email verification establishes an ordinary user session, the invitation UI calls `accept_invitation(token)` and removes the secret from the URL. All UI text/error mappings belong in es-AR i18n. UI pages were intentionally left to the later task.

`POST /functions/v1/support-session` accepts either:

```json
{
  "action": "start",
  "target_tenant_id": "10000000-0000-0000-0000-000000000001",
  "target_user_id": "20000000-0000-0000-0000-000000000002",
  "reason": "Investigate reported issue",
  "duration_minutes": 30,
  "client_event_id": "80000000-0000-4000-8000-000000000001"
}
```

or `{ action: "end", target_support_session_id }`. Start returns `{ access_token, expires_at, support_session_id, tenant_id, target_user_id }`; end returns `{ ended: true }`. The SQL start/end transaction produces the audited lifecycle event. Start is idempotent for the same live session and never extends it. A finished retry is denied.

Use `createSupportClient(url, publishableKey, access_token)` for tenant data/Storage and retain the actor's normal client separately. The support client is ephemeral, has no persisted Auth session and no refresh behavior; the SDK blocks normal Auth methods for its custom-token client. Show the support banner, target, reason and expiry in the later UI; clear the support client at expiry/end and restore the actor context. Never call `auth.setSession` with the support token or manufacture a refresh token.

| HTTP | Function code                                             |
| ---- | --------------------------------------------------------- |
| 400  | `invalid_input`                                           |
| 401  | `unauthorized` (invitation authentication)                |
| 403  | `forbidden`, `origin_denied`, or `session_already_active` |
| 405  | `method_not_allowed`                                      |
| 502  | `delivery_failed`; retry with the same event UUID         |
| 503  | `service_unavailable`; configuration/runtime failure      |

Responses use `Cache-Control: no-store`. CORS accepts only the configured app origin. Configure `DOMUS_APP_URL` to the actual web origin and add `/invitations/accept` to the Auth redirect allowlist; local wildcard routes already permit it. `verify_jwt=false` is intentional for asymmetric JWT compatibility: caller-bound PostgREST verifies/authenticates every protected RPC, and invitation delivery also verifies through Auth. Service credentials never authorize caller operations.

Error reporting uses a generated bundle of `@domus/observability`, emitting only static failure codes and operation names, never request bodies, tokens, emails or reasons. Regenerate it with `node supabase/functions/build-reporting.mjs` after changes to the reporting module; a source-hash test detects stale bundles.

## Impersonation mechanism, signing configuration and rotation

Auth 2.197.0's `requireAuthentication` loads the token's `session_id` and rejects absent sessions before user/MFA handlers execute. The issued token uses the **support-session UUID as a deliberately nonexistent Auth-session UUID**. No row is inserted into `auth.sessions`, and no refresh token is issued. This prevents credential/email/MFA mutations even through direct Auth HTTP requests; relying solely on a UI ban would be insufficient. This behavior was checked against the [installed Auth version's source](https://github.com/supabase/auth/blob/v2.197.0/internal/api/auth.go) and exercised locally.

Claims are target `sub`, `role=authenticated`, `aud=authenticated`, `aal=aal1`, `session_id=support_session_id`, `support_session_id`, `support_tenant_id`, `impersonator_user_id`, `impersonator_aal=aal2`, `iat`, and `exp=floor(session expiry)`. Every identity resolution checks matching claims, live status, expiry, active platform actor, non-platform target and the absence of an Auth session with that ID. Tenant sets return only the selected tenant, even for a user belonging to several tenants. Target membership/permissions and subscription restrictions still apply. Ending/revoking, expiry, actor deactivation, target promotion or claim mismatch removes identity on subsequent requests. A transaction already authorized before concurrent termination can finish; revocation is checked at each subsequent statement/request.

Support identities cannot start/extend support sessions, accept/send/revoke invitations, use platform-management RPCs, or read/modify support rows through tables. They may end their own current support session through the authorized RPC. The actor can also end it using their ordinary MFA token. Support-session reason/duration remain visible to tenant administrators with `access_audit`.

Hosted configuration is deferred under D19. Before enabling it, the orchestrator must generate/import a **dedicated ES256 or RS256 signing key distinct from normal Auth's active key**, retain it as a trusted previous key and set the private JWK (including `alg` and matching `kid`) only in the Edge secret `DOMUS_SUPPORT_SIGNING_JWK`. Reject use of the caller's normal Auth key ID. Import/activation followed by rotating back to the normal Auth key establishes the dedicated key as previously used; follow platform transition timing and verify a test token through PostgREST before enabling support. Private keys cannot be recovered from managed Supabase after import. [Supabase signing-key lifecycle and import documentation](https://supabase.com/docs/guides/auth/signing-keys) supports this configuration.

For rotation, register/trust a new dedicated key, verify it, replace the Edge secret and keep the previous support key trusted for at most the remaining 60-minute token window. Then revoke the old key. For an emergency, revoke support sessions immediately through database status/end operations and revoke the compromised signing key; also replace the Edge secret. Do not rotate normal Auth's key as a substitute for support-session revocation.

Other Edge secrets: `DOMUS_INVITATION_TOKEN_KEY` (at least 32 characters; independently generated), `DOMUS_APP_URL`, and Supabase-provided URL/anon/service credentials. Invitation-key rotation requires preserving the old key during pending-token retry windows or revoking those invitations and issuing new event IDs; stored token hashes remain valid for already-delivered secrets.

The HS256 fallback is strictly local: `DOMUS_ENVIRONMENT=local`, `SUPABASE_URL` exactly `http://kong:8000`, `http://127.0.0.1:54321` or `http://localhost:54321`, and an explicit server-only `DOMUS_LOCAL_JWT_SECRET`. It fails closed for hosted URLs or other environments. No private key or `.env` file is committed. Hosted asymmetric key registration has not been performed or claimed as tested; local acceptance uses the explicitly approved local fallback.

## Live demo evidence and repeatability

Actual local HTTP output (2026-10-10):

```text
PASS Mailpit email -> verified acceptance -> membership with 10 permissions
  invitation: 47295e66-f2af-4738-8817-16f31e856fd4
PASS suspended tenant remains readable; profile write rejected with 42501
PASS target write audited with impersonator, target and support session
  support session: 3e0eb314-3bea-4a8b-b046-5697057fcb4e
PASS direct Auth password, email, MFA enrollment and factor deletion rejected: session_not_found
PASS support session ended from target token; subsequent reads return zero rows
PASS Storage API platform upload/update/delete, member/support read and revoked support denial
Local HTTP acceptance complete
```

The demo created a dedicated fictional platform account, enrolled/challenged/verified **real TOTP** to obtain AAL2, created a tenant, sent an actual Mailpit invitation, followed its verification link and accepted it. It checked suspended read/write behavior, minted a support JWT, performed and inspected an attributed write, attempted four direct Auth mutations, then ended support and verified immediate lockout. It also uploaded/updated/deleted a real private logo through the Storage API and checked ordinary-member/support downloads plus revoked-support denial. These fixtures were removed by the final clean reset; seed retains the two original tenants, pending/accepted invitation examples and a finished support-session example. The coordinator was notified when the shared DB became available again for T9 e2e.

To repeat against the local stack:

```powershell
node supabase/functions/local-demo.mjs --prepare
pnpm supabase functions serve --env-file supabase/.env.local
# In a second terminal:
node supabase/functions/local-demo.mjs
```

The setup writes only a gitignored local function environment. The demo is hard-limited to the local API and never prints credentials or token values. It adds temporary fictional fixtures; coordinate any reset with other workers using the shared stack.

## Delivered scope and remaining milestones

M01-F01/F02/F04/F05 database and function behavior is complete locally. M01-F03 stores the typed configuration required by D20; unit counting remains H2. The support banner/invitation pages, app-specific es-AR errors and later gate exemptions belong to their UI/M05 tasks. Staging deployment, dedicated hosted signing-key registration and production mail configuration remain deferred under D19 and are operator integration work.
