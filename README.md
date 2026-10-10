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

| Command                   | Purpose                                                                   |
| ------------------------- | ------------------------------------------------------------------------- |
| `pnpm dev`                | Start the web application (start Supabase first)                          |
| `pnpm build`              | Production web build                                                      |
| `pnpm lint`               | ESLint across packages                                                    |
| `pnpm typecheck`          | Generate Next.js route types and check strict TypeScript                  |
| `pnpm test`               | Unit and smoke tests; domain coverage must be at least 80%                |
| `pnpm test:db`            | Run local pgTAP tests (requires running Supabase)                         |
| `pnpm format`             | Format code using the shared Prettier configuration                       |
| `pnpm supabase <command>` | Invoke the installed Supabase CLI                                         |
| `pnpm gen:types`          | Replace `packages/supabase/src/database.types.ts` from the local database |

The database type file is intentionally an empty-schema placeholder until the schema task. Type generation uses a Node script so it writes UTF-8 consistently on Windows and POSIX and preserves the existing file on CLI failure.

## Toolchain

Main dependencies are pinned: Next.js 16.4.0, React 19.3.0, Tailwind CSS 4.3.3, Turborepo 2.11.7, Zod 4.6.5 and Supabase CLI 2.120.0. The lockfile records the resolved dependency graph.

TypeScript is pinned to 6.0.3 because current typescript-eslint supports TypeScript below 6.1, while the latest TypeScript is 7.0.2. Vitest and its coverage provider are pinned to 4.1.11 because Vitest 5 excludes Node 25. jsdom 29.1.1 is used because jsdom 30 also excludes Node 25. ESLint 9.39.5 is used because the plugins shipped with the latest Next.js ESLint config do not support ESLint 10. These compatibility pins are approved for this task. Vite 8.3.4 and PostCSS 8.5.29 use the latest stable releases. The workspace explicitly allows only required dependency build scripts using pnpm 11's `allowBuilds` setting.

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
