# Domus — Rules for every agent

Domus is a multitenant SaaS for gated communities ("barrios privados") in Argentina. Read this file fully before
changing anything. It is short on purpose; the details live in `KnowledgeBase/`.

## Sources of truth

| File | What it governs |
|---|---|
| `KnowledgeBase/InitialProposal.md` | Product spec (Spanish): scope, modules `Mxx-Fyy`, acceptance criteria, principles P1–P8 / S1–S9, milestones. |
| `KnowledgeBase/DESIGN.md` | Design system. **Part A is normative.** |
| `KnowledgeBase/GLOSSARY.md` | Spanish spec term → English code name, for every table and enum value. |
| `AGENTS.md` (this file) | Coding rules. |

Do only the task you were given. If the spec is ambiguous or contradicts itself, ask (or report it) instead of guessing.
Never weaken a security principle (S1–S9) to make something work.

## Language

- **All code is English**: identifiers, file names, DB objects, comments, commit messages, PR descriptions, test names.
- **All user-facing text is Spanish (es-AR)**, kept in i18n message files — never hard-coded in components.
- Use the names from `GLOSSARY.md`. If a concept is missing, add it there in the same change.

## Database naming (GeneXus-style semantics, snake_case)

The goal: from a column name alone you can tell which entity it belongs to and which entity it points to.

1. **Tables**: singular, snake_case, named after the entity: `unit`, `person`, `membership`. A table that only exists
   as a child of another is prefixed with the parent: `event_guest`, `access_authorization_time_slot`.
2. **Primary key**: `<table>_id`, type `uuid` (default `gen_random_uuid()`). Example: `unit.unit_id`.
3. **Every attribute is prefixed with its table name**: `unit_name`, `unit_status`, `person_first_name`,
   `movement_created_at`. No bare `name`, `status`, `created_at`.
4. **Foreign keys use exactly the name of the referenced primary key**: `movement.unit_id → unit.unit_id`,
   `tenant_id` everywhere. Never `unit`, `unit_ref`, `fk_unit`.
5. **Same name ⇒ same concept.** A column name means one thing across the whole schema. Never reuse a name for a
   different meaning.
6. **Subtypes (roles)**: when a table references the same entity in a specific role, or more than once, the FK is
   `<table>_<role>_<referenced_pk>`: `movement_guard_person_id`, `approval_request_responder_person_id`,
   `access_authorization_created_by_person_id`. Use a plain FK name (rule 4) only for the main, role-free relationship.
7. **Suffix by category**: `_id`, `_name`, `_description`, `_code`, `_number`, `_date` (`date`), `_at` (`timestamptz`,
   always UTC), `_time` (`time`), `_amount` (`numeric(14,2)`, ARS), `_quantity`, `_status`, `_type`, `_kind`,
   `_count`. Booleans: `<table>_is_<adjective>` / `<table>_has_<noun>` (`unit_is_billable`).
8. **Enums**: Postgres enum types named after the attribute concept (`unit_status`, `household_access_mode`), with the
   values from `GLOSSARY.md`. Reusable column types (money, document number, phone) are Postgres `domain`s.
9. Other DB objects: indexes `<table>_<columns>_idx`, unique `<table>_<columns>_key`, checks `<table>_<rule>_check`,
   functions `snake_case` verbs (`consume_access_pass`, `decide_access`), RLS policies with a readable
   English sentence (`"tenant members can read units"`).

In TypeScript, rows keep the DB names (`row.unit_name`). Generated Supabase types are the source of truth; don't
hand-write duplicate row types.

## Multitenancy and security (non-negotiable, spec §5.2 and §8.3)

- Every tenant table has `tenant_id uuid not null` and **RLS enabled** with policies based on active memberships,
  resolved by `SECURITY DEFINER` helper functions with a fixed `search_path`.
- Composite FKs or checks prevent cross-tenant references (a row can't point at another tenant's unit).
- Every new tenant table needs isolation tests (user from tenant A can't read/write tenant B).
- Audit and movement data are **append-only**: corrections are new rows with a reason and an author.
- `service_role` keys never reach the client; they live only in Edge Functions / server code.
- Business-critical decisions (access decision, pass consumption, closing approval requests) live in SQL functions or
  Edge Functions, never in UI code. Retryable writes are idempotent via a unique `client_event_id`.
- Minimal personal data (S5): no ID document photos, no full PDF417 payload.

## Stack and layout

- **Node 25** (`.nvmrc`), **pnpm** workspaces, **Turborepo**, TypeScript `strict` everywhere.
- `apps/web` — Next.js (App Router) + Tailwind v4 with tokens from `DESIGN.md` Part A.
- `apps/mobile` — Expo (built at milestone H11; skeleton until then).
- `packages/domain` — shared business logic, Zod schemas, types, presentation rules. **Logic that the mobile app will
  also need goes here, not in React components.**
- `packages/ui-tokens` — design tokens shared by web and mobile.
- `packages/supabase` — typed Supabase client helpers and generated DB types.
- `supabase/` — migrations, seed data (two fictional tenants), pgTAP tests, Edge Functions.

## Supabase workflow

- **Local first**: develop and test against the local stack (`pnpm supabase start`, Docker). Schema changes are new
  migration files in `supabase/migrations/` — never edit an applied migration, never change the remote DB by hand.
- The cloud project (`Domus`, ref `kymaarzsbhiczmpazepm`) is **staging**. Only the orchestrator applies migrations to
  it after integration.
- After a schema change: regenerate types, run `pnpm test:db` (pgTAP, incl. isolation suite).

## Quality bar

- Write your task report to `reports/<feature-id or task>.md` (what was done, versions, decisions, acceptance output).
- Several agents may run at once on this machine: use the dev-server port your task assigns (default 3000) and don't stop
  Docker containers or servers you didn't start.
- Before reporting done: `pnpm lint`, `pnpm typecheck`, `pnpm test` (and `pnpm test:db` if you touched `supabase/`) pass.
- Tests for every behavior you add; `packages/domain` coverage ≥ 80 %.
- UI: works at 360 px and 1440 px; touch targets ≥ 44 px (≥ 56 px in gate mode); state is never conveyed by color only;
  WCAG 2.1 AA.
- No observability vendor yet (Sentry deferred): report errors through the project's error-reporting module, never
  log PII.

## Git

- Branch per task; small, focused commits in English, prefixed with the feature ID: `M00-F05: add membership RLS helpers`.
- Don't commit secrets or `.env*` files (only `.env.example`).
- Don't push to `main` or rewrite history unless the task says so.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
