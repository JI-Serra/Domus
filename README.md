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
