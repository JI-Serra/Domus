# Domus

Multitenant community management for gated communities in Argentina. This is the M00-F01 monorepo skeleton; product features follow in later tasks.

## Prerequisites

- Node 25 (see `.nvmrc`).
- pnpm 11.11.0.
- Docker Desktop running with Linux containers for local Supabase.

## Setup

1. Run `pnpm install` at the repository root.
2. Run `pnpm supabase start` to start the local stack.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`. Use `Copy-Item` in PowerShell or `cp` on POSIX. Replace the anon key placeholder with the local anon key printed by Supabase (`pnpm supabase status` shows it again).
4. Run `pnpm dev` and open <http://localhost:3000>.

Stop the web server with Ctrl+C and the local stack with `pnpm supabase stop`. Cloud Supabase is staging and is managed by the orchestrator; these commands target local development only.

## Workspace

| Path                 | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `apps/web`           | Next.js App Router web application                          |
| `apps/mobile`        | Placeholder until milestone H11                             |
| `packages/domain`    | Shared validation and business concepts                     |
| `packages/ui-tokens` | Placeholder for shared design tokens                        |
| `packages/supabase`  | Typed browser/server factories and generated database types |
| `packages/config`    | Shared strict TypeScript, ESLint and Prettier configuration |
| `supabase`           | Local stack configuration, seed and pgTAP tests             |

Internal TypeScript packages export source modules through workspace exports; Next.js transpiles them. The server Supabase factory takes a request-scoped cookie adapter, so this package does not depend on Next.js and can be reused by other server contexts.

## Commands

| Command                   | Purpose                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`                | Start the web application (start Supabase first)                                |
| `pnpm build`              | Production web build                                                            |
| `pnpm lint`               | ESLint across packages                                                          |
| `pnpm typecheck`          | Generate Next.js route types and check strict TypeScript                        |
| `pnpm test`               | Unit and smoke tests; domain coverage must be at least 80%                      |
| `pnpm test:db`            | Run local pgTAP tests (requires running Supabase)                               |
| `pnpm test:e2e`           | Build, then run the Playwright suite (needs local Supabase; see Authentication) |
| `pnpm format`             | Format code using the shared Prettier configuration                             |
| `pnpm supabase <command>` | Invoke the installed Supabase CLI                                               |
| `pnpm gen:types`          | Replace `packages/supabase/src/database.types.ts` from the local database       |

The database type file is intentionally an empty-schema placeholder until the schema task. Type generation uses a Node script so it writes UTF-8 consistently on Windows and POSIX and preserves the existing file on CLI failure.

## Toolchain

Main dependencies are pinned: Next.js 16.4.0, React 19.3.0, Tailwind CSS 4.3.3, Turborepo 2.11.7, Zod 4.6.5 and Supabase CLI 2.120.0. The lockfile records the resolved dependency graph.

TypeScript is pinned to 6.0.3 because current typescript-eslint supports TypeScript below 6.1, while the latest TypeScript is 7.0.2. Vitest and its coverage provider are pinned to 4.1.11 because Vitest 5 excludes Node 25. jsdom 29.1.1 is used because jsdom 30 also excludes Node 25. ESLint 9.39.5 is used because the plugins shipped with the latest Next.js ESLint config do not support ESLint 10. These compatibility pins are approved for this task. Vite 8.3.4 and PostCSS 8.5.29 use the latest stable releases. The workspace explicitly allows only required dependency build scripts using pnpm 11's `allowBuilds` setting.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request to `main`. A newer push to the same branch cancels the older run (concurrency group per branch).

| Job        | What it runs                                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quality`  | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` through Turborepo                                                                                                                                                                                        |
| `e2e`      | Full local Supabase start (Postgres, Auth, API gateway, mail catcher), `pnpm build`, then Playwright (Chromium; 1440 px and 360 px projects) against `next start`. The HTML report and traces are uploaded as the `playwright-report` artifact when the job fails |
| `database` | `pnpm supabase start` with only Postgres and Auth (all other services excluded with `-x`), then `pnpm test:db` (pgTAP, including the RLS/isolation suite), then `supabase stop`                                                                                   |

Node comes from `.nvmrc`, pnpm from `packageManager` in `package.json`, and the pnpm store is cached by `actions/setup-node`; `.turbo` is cached separately. Run the same checks locally with the commands in the table above before pushing.

## Authentication

Sign-in uses Supabase Auth with the session in cookies (`@supabase/ssr`), so it survives reloads. All routes and copy are es-AR.

| Route            | Purpose                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/ingresar`      | Email + password, or a magic link sent by email (segmented control). Honors `?next=<path>` (same-origin paths only)        |
| `/recuperar`     | Password recovery request. The answer is identical whether or not the email has an account                                 |
| `/restablecer`   | Choose a new password; needs the recovery session opened by the email link                                                 |
| `/auth/callback` | Route handler the email links land on: exchanges the `code` (PKCE) or `token_hash` for a session, then redirects to `next` |

- **Protection.** `apps/web/src/proxy.ts` refreshes the session on every request and protects everything except `/ingresar`, `/recuperar`, `/restablecer`, `/auth/*`, `/design` and `/api/debug/error` (default deny; list in `lib/auth/redirect.ts`). Visitors go to `/ingresar?next=<path>`. The `(app)` layout checks the session again.
- **Errors.** Supabase errors are mapped to es-AR messages in `lib/auth/errors.ts` (invalid credentials, unconfirmed email, rate limit, expired link, network, weak password…). The raw English message is never shown.
- **Active context.** The server loads the user's active memberships (with their tenant) through the user's own RLS-scoped client — never `service_role` — and `@domus/domain/context` validates the choice: the `domus-context` cookie only _requests_ a context, and it is re-checked on every request, so a stale or forged value falls back to the first barrio by name. Switching uses a server action. Units arrive in M02 (unit is `null`). The "Plataforma" option appears only for an active platform admin whose session is `aal2` (MFA enrollment: M01-F05). A user without memberships sees an empty state with a logout button.
- **Error-reporting headers.** The proxy sets `x-domus-tenant-id` and `x-domus-membership-role` from the validated context (and strips any client-supplied values), so `@domus/observability` reports tenant context.
- **Local emails** arrive in the Supabase mail catcher (Mailpit): <http://127.0.0.1:54324>. Use **`http://127.0.0.1:3000`** (the auth `site_url`) or `http://localhost:3000`; `supabase/config.toml` allows both as email redirect targets. Restart the stack after changing that file.

### End-to-end tests

`pnpm test:e2e` builds the app and runs Playwright (Chromium, projects `desktop-1440` and `mobile-360`) against `next start` on port 3000, with the local Supabase stack running and seeded (`pnpm supabase start`; `pnpm supabase db reset` for a clean seed). It covers login, wrong password, logout, route protection, magic link and password recovery through the mail catcher, switching between the two barrios of `shared@domus.local`, forged context cookies, and an isolation demo (a tenant A user querying tenant B rows with supabase-js gets nothing). Recovery and empty-state tests create their own throwaway account, so the seeded users are never modified.

- First run: `pnpm --filter @domus/web exec playwright install chromium`.
- `E2E_DEV=1` runs against `next dev` instead; an already running server on the port is reused locally. `E2E_PORT`, `E2E_BASE_URL` and `MAILPIT_URL` override the defaults.
- `E2E_SCREENSHOTS=1 pnpm --filter @domus/web test:e2e screenshots` refreshes `docs/screenshots/h0/login-*` and `context-selector-*`.
- The tests read `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `apps/web/.env.local` (CI exports them from `supabase status`).

## Error reporting

`packages/observability` (`@domus/observability`) is the only way application code reports errors (decision D15: no Sentry for now). It has no vendor dependency.

```ts
import {
  reportError,
  reportMessage,
  setReportingContext,
} from '@domus/observability';

setReportingContext({
  tenantId,
  membershipRole,
  environment: 'staging',
  release: sha,
});
reportError(error, { route: '/gate/arrivals' });
reportMessage('warning', 'Access pass nearly exhausted', { passId });
```

Every payload goes through `scrubPii` before any adapter sees it: emails, DNI numbers (7-8 digits), phone numbers, JWTs and bearer tokens are masked inside strings, and values under keys such as `email`, `phone`, `password`, `token`, `*_document_number` are replaced with `[REDACTED]`, recursively. Never log PII on purpose; the scrubber is a safety net, not a licence.

The default `consoleAdapter` prints one structured JSON line per event (`console.error` for `error`/`fatal`, `console.warn` for `warning`, `console.log` otherwise).

### Web integration

- `apps/web/src/instrumentation.ts`: `register()` sets `environment` and `release`; `onRequestError` reports server errors with method, route and tenant context (from the `x-domus-tenant-id` and `x-domus-membership-role` request headers, which the proxy sets from the validated active context, see Authentication).
- `apps/web/src/app/global-error.tsx` reports uncaught client render errors.
- `GET /api/debug/error` throws a forced error (HR-00 demo). It answers 404 when `NODE_ENV=production` unless `DOMUS_ENABLE_DEBUG_ROUTES=true`. Try it with `curl http://localhost:3000/api/debug/error` and read the JSON line in the dev server output: the fake email, DNI and phone in the message come out masked and the line carries the tenant context.

### Plugging in Sentry (or another provider) later

Implement `ReportingAdapter` and register it once at startup; no business code changes. The adapter receives already-scrubbed events.

```ts
// packages/observability/src/sentry-adapter.ts (not part of this repo yet)
import * as Sentry from '@sentry/nextjs';
import type { ReportingAdapter } from './types';

export const sentryAdapter: ReportingAdapter = {
  name: 'sentry',
  capture(event) {
    Sentry.withScope((scope) => {
      scope.setLevel(event.level === 'warning' ? 'warning' : event.level);
      scope.setTag('tenant_id', String(event.context.tenantId ?? 'unknown'));
      scope.setContext('domus', event.context);
      if (event.error) {
        const error = new Error(event.error.message);
        error.name = event.error.name;
        error.stack = event.error.stack;
        Sentry.captureException(error);
      } else {
        Sentry.captureMessage(event.message);
      }
    });
  },
};

// instrumentation.ts, inside register(): setReportingAdapter(sentryAdapter);
```

Keep Sentry's own default PII collection off (`sendDefaultPii: false`) so the provider adds nothing the scrubber removed.

### Environments and variables

| Variable                        | `local`                            | `staging`                                  | Notes                                                                  |
| ------------------------------- | ---------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://127.0.0.1:54321`           | `https://kymaarzsbhiczmpazepm.supabase.co` | Public                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | printed by `pnpm supabase status`  | staging anon key                           | Public; never put the `service_role` key in a `NEXT_PUBLIC_*`          |
| `DOMUS_ENVIRONMENT`             | `local` (default)                  | `staging`                                  | Attached to every report                                               |
| `DOMUS_RELEASE`                 | empty                              | git SHA set by the deploy                  | Attached to every report                                               |
| `DOMUS_ENABLE_DEBUG_ROUTES`     | unset (debug routes are on in dev) | `true` only while running the HR-00 demo   | Staging runs a production build, where debug routes are off by default |

`apps/web/.env.example` lists the same variables with no secrets.

## Local data & test users

**Local-only:** `pnpm supabase db reset` recreates two fictional communities and the accounts below. All passwords are `DomusLocal123!`; never run this seed against staging or production. All document numbers and addresses are fictional.

| Email                         | Role                              | Community                          |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| `platform@domus.local`        | Platform admin (MFA required)     | Platform; no tenant memberships    |
| `admin.ceibos@domus.local`    | Tenant admin, all ten permissions | Barrio Los Ceibos                  |
| `guard.ceibos@domus.local`    | Guard                             | Barrio Los Ceibos                  |
| `holder.ceibos@domus.local`   | Unit holder                       | Barrio Los Ceibos                  |
| `member.ceibos@domus.local`   | Household member                  | Barrio Los Ceibos                  |
| `admin.tipas@domus.local`     | Tenant admin, all ten permissions | Barrio Las Tipas                   |
| `guard.tipas@domus.local`     | Guard                             | Barrio Las Tipas                   |
| `holder.tipas@domus.local`    | Unit holder                       | Barrio Las Tipas                   |
| `member.tipas@domus.local`    | Household member                  | Barrio Las Tipas                   |
| `registry.ceibos@domus.local` | Tenant admin, registry only       | Barrio Los Ceibos                  |
| `shared@domus.local`          | Unit holder in both tenants       | Separate tenant-scoped person rows |

H0 has no unit relationships yet; those arrive in M02. A platform login alone grants no database access: its signed JWT must have `aal2`. MFA enrollment and the support-access workflow arrive in M01; SQL tests impersonate signed claims locally with `request.jwt.claims`.

Run `pnpm test:db` after reset for schema guards, membership isolation, and append-only audit checks. Helpers live in the private `app_private` schema, which is excluded from PostgREST. Attach `app_private.audit_row_change()` as an `AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW` trigger when adding sensitive tables; its migration documents the required UUID primary key naming and diff format.

Role and permission tables accept no direct client writes. The exposed `public` RPCs are `create_membership`, `update_membership`, `revoke_membership`, `delete_membership`, `grant_admin_permission`, `revoke_admin_permission`, `create_platform_admin`, `update_platform_admin`, `delete_platform_admin`, and `update_tenant_platform_settings`. Registry admins manage non-admin memberships; admin memberships and permission grants require `admin_management`. Membership and permission RPCs reject targeting the caller's own membership, and tenant grantors can grant only permissions they hold. Platform-admin management RPCs require MFA. MFA platform admins can bootstrap/manage admin memberships and permissions, with every write audited, but have no standing access to people, memberships, or permission tables.

Clients cannot bind `person.user_id`; invitation acceptance will bind the authenticated user in M02-F04. Slug and subscription updates use the MFA platform RPC. Audit redacts document numbers, phones, and birth dates as changed markers, and stores the originating database role. Register each sensitive table in `audit_redacted_columns`, attach its audit trigger, and enable the trigger **always**. The operator-only `app_private.purge_audit_events(before_at)` runs as a dedicated NOLOGIN role and audits purge volume; no cron schedule is installed. Exceptional platform support access (M01-F04) and a minimal guard projection (L4, M05) remain pilot blockers.
