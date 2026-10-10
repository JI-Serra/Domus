# T13 — One-command local stack + CI coverage for Storage and Edge Functions

## What was done
- `pnpm stack` (`scripts/stack.mjs`, Node, no shell): starts Supabase if needed, runs `scripts/prepare-function-env.mjs`, serves Edge Functions (`supabase functions serve --env-file supabase/.env.local`), runs `next dev` on 127.0.0.1:3000, waits until functions and web answer, prints App / Mailpit / Studio / API / Functions URLs. Shutdown kills both process trees (`taskkill /T` on Windows, process groups on POSIX); Supabase keeps running unless `--stop`.
- `pnpm stack:reset` (`scripts/stack-reset.mjs`): `supabase db reset` + env refresh. Not executed here (the DB worker owns resets).
- `scripts/prepare-function-env.mjs`: writes gitignored `supabase/.env.local` (keeps the invitation token key across runs unless `--force`; refreshes the JWT secret) and creates `apps/web/.env.local` from the running stack when missing. `supabase/functions/local-demo.mjs --prepare` now reuses it. Shared helpers in `scripts/lib/supabase-cli.mjs`.
- `scripts/e2e-preflight.mjs`: Playwright `globalSetup` (in `apps/web/playwright.config.ts`) fails the whole run when Storage, either Edge Function or Mailpit is unreachable. With `--wait` it is the CI health gate. The only `test.skip` in the backoffice suite is the mobile-width one; nothing skipped on missing functions, so the preflight turns that failure mode into a loud error.
- CI e2e job: Storage and Edge runtime no longer excluded (imgproxy, realtime, studio, logflare, vector, supavisor, postgres-meta still are); runtime-generated function env; `supabase functions serve` in the background (`functions.log` uploaded on failure); preflight wait; then build + Playwright.
- Actions bumped to Node 24 runtimes (verified `using: node24`): checkout v6, setup-node v6, cache v5, upload-artifact v7, pnpm/action-setup v5.
- README: Setup replaced by `pnpm stack` + URL table + troubleshooting; commands table and CI/e2e text updated; test-users table untouched.

## Verification
- `actionlint .github/workflows/ci.yml` (built with `go install`): clean.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: pass.
- Cold `pnpm stack` on Windows (Supabase already running from the other worker; env files absent):
```
supabase/.env.local written
apps/web/.env.local created from the running stack
Setting up Edge Functions runtime...
▲ Next.js 16.4.0 (Turbopack) - Local: http://127.0.0.1:3000 ... ✓ Ready
Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>
 - .../send-invitation  - .../support-session

Domus local stack is ready
  App       http://127.0.0.1:3000
  Mailpit   http://127.0.0.1:54324
  Studio    http://127.0.0.1:54323
  API       http://127.0.0.1:54321
  Functions http://127.0.0.1:54321/functions/v1
```
- Shutdown: a real Ctrl+C cannot be sent from this non-interactive agent shell; I exercised the same `shutdown()` path by killing the web process: output "Stopping web server and Edge Functions... Supabase is still running", port 3000 freed, functions process gone, DB/edge containers left untouched.
- `E2E_DEV=1 playwright test design.spec.ts` ran with the new globalSetup: 2 passed.
- NOT verified locally: the full CI e2e job (logo upload, invitation via Mailpit, support session) — needs the pushed run; the DB worker was using the shared stack, so I did not run the backoffice suite.

## Incident / decision
My first version ran `supabase functions stop` on shutdown, which removed the shared `supabase_edge_runtime_domus` container while the other worker's stack was up. I removed that call (serve cleans up after itself) and restored the container by running `pnpm stack` again; the edge container is up now. Worth telling the DB worker if they saw function 503s around that time.

## Notes
- Commit prefix `M00-F01:`; not pushed.
