# T5 — CI pipeline + M00-F07 error reporting

## What was done

- `.github/workflows/ci.yml`: jobs `quality` (lint, typecheck, test, build) and `database` (Supabase CLI with only Postgres + Auth, `pnpm test:db`). Node from `.nvmrc`, pnpm from `packageManager`, pnpm store cached by `setup-node`, `.turbo` cached, concurrency group per branch (cancel in progress).
- `packages/observability` (`@domus/observability`): `reportError`, `reportMessage`, `setReportingContext`, `setReportingAdapter`, `createReporter`, `ReportingAdapter`, `consoleAdapter` (one JSON line), `scrubPii`. No dependencies. 30 tests, ~98 % coverage (threshold 80 %).
- Web: `src/instrumentation.ts` (`register` + `onRequestError`), `src/app/global-error.tsx`, `GET /api/debug/error` (404 in production unless `DOMUS_ENABLE_DEBUG_ROUTES=true`).
- Docs: README sections "CI" and "Error reporting" (incl. Sentry adapter sketch and env vars per environment), `apps/web/.env.example`.
- Small supporting edits: `apps/web/package.json` dependency, `apps/web/next.config.ts` `transpilePackages`, `turbo.json` env list for the new `DOMUS_*` variables, lockfile.

## Decisions

- Auth (GoTrue) stays in the database job: the `auth` schema/`auth.users` come from GoTrue and RLS tests create users. All other services are excluded (`-x`). If the DB worker's suite does not need it, add `gotrue` to the exclude list.
- Tenant context in `onRequestError` comes from request headers `x-domus-tenant-id` / `x-domus-membership-role` (to be set by the future tenant-resolution layer). The debug route falls back to `demo-tenant-a` / `tenant_admin` and passes it through a `domusReportingContext` property on the thrown error, so `curl` without headers still shows tenant context. `setReportingContext` is process-global (as specified), so per-request tenant data is passed per call, not through it.
- Scrubbing: sensitive key fragments (`email`, `phone`, `password`, `token`, `secret`, `authorization`, `cookie`, `apikey`, `documentnumber`, `dni`) redact the value; strings are masked for JWT/Bearer, email, phone, DNI. UUIDs, ISO dates and `pkg@version` paths are left intact (tested). Stack traces are capped at 12 lines.
- `global-error.tsx` has hard-coded Spanish copy because it replaces the root layout and i18n messages (owned by another worker) are not reachable there; move to i18n once the messages layer exists.
- Action versions used: checkout@v4, setup-node@v4, pnpm/action-setup@v4, cache@v4. `pnpm/action-setup@v4` with pnpm 11 is untested until the first real run.

## Acceptance

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`: all pass locally.
- `actionlint` (docker `rhysd/actionlint:latest`): no findings. Valid `supabase start -x` service names checked against `supabase start --help`.
- Not verifiable here: the real GitHub run and `supabase start` in CI (local stack belongs to the DB worker; not started).
- `NODE_ENV=production next start` → `GET /api/debug/error` returns 404.
- `pnpm dev` on port 3001, `curl http://localhost:3001/api/debug/error` → 500 and this line (stack shortened here):

```
{"timestamp":"2026-10-10T00:50:21.716Z","level":"error","message":"Forced debug error for resident [email], DNI [document], phone [phone]","error":{"name":"ForcedDebugError","message":"Forced debug error for resident [email], DNI [document], phone [phone]","stack":"ForcedDebugError: Forced debug error for resident [email], DNI [document], phone [phone]\n    at GET (...)\n    ..."},"context":{"environment":"local","tenantId":"demo-tenant-a","membershipRole":"tenant_admin","method":"GET","path":"/api/debug/error","routePath":"/api/debug/error","routeType":"route","routerKind":"App Router"}}
```

Note: in `next dev`, Next.js itself also prints the raw thrown error to the terminal (outside our module, dev only). The module's own line is the scrubbed JSON above.
