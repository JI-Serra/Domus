# M03 access policy admin UI — T23

Branch `JI-Serra/h3-t23-policy-ui`. Consumes the T22 contract (`reports/M03-db.md`): `@domus/domain/access-policy`,
`@domus/supabase/access-policy`, the four RPCs. No migration, no `service_role`, no staging change, nothing pushed.

## What was built (M03-F01 – F06)

| Route                             | What                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/access-policy`         | Matrix (visitor type × modes, default, identity toggle), time-out and limits, templates with diff preview, save. Read-only for administrators without `access_config` and for a suspended/cancelled barrio.                                                                                                                            |
| `/settings/access-policy/history` | One card per explicit change: date/time (tenant time zone), who (name when the viewer may read the registry, else "Administrador del barrio"; support entries show "Equipo de Domus como …"), Manual or "Plantilla X", and a compact before → after list. `access_config` only; anybody else gets the same 404 as for an unknown page. |
| `/settings`                       | New entry "Reglamento de accesos", shown only with `access_config` (existing "Accesos de soporte" entry unchanged).                                                                                                                                                                                                                    |

Behavior notes

- **Hard rules live in the domain validator, enforced live in the UI.** `unknown` cannot allow direct entry/notify (the
  boxes are disabled; an info button explains why — no paragraph). The last allowed mode cannot be switched off, and the
  default is a `<select>` of the allowed modes only (switching off the default moves it to the first allowed mode).
  Limits are typed text parsed as whole numbers; out-of-range / non-integer values show `Ingresá un número entero entre
{min} y {max}.` (bounds read from `accessPolicyBounds`) and disable Save. Save is also gated by `validatePolicy`.
- **Templates**: "Estricto / Equilibrado / Flexible" each open a confirmation sheet with the `diffPolicy` diff against the
  _saved_ policy (long diffs scroll inside the sheet; confirm stays in view). Unsaved edits are discarded on apply — the
  sheet says so only when there are any. Applying calls `apply_access_policy_template`.
- **Idempotency**: one `client_event_id` per pending change (fingerprint of the payload); a retry of the same failed change
  reuses it, a different change gets a new one. Success clears the key so a later submission of the same values is a new
  operation instead of replaying an old receipt. Both retry reuse and success renewal have component coverage.
- **Errors** are mapped from SQLSTATE only (`42501` denied / retry-denied, `22023` invalid, lock/serialization → busy,
  rest → generic + `reportError`); raw database text never reaches the browser.
- **Member subset for M04**: `loadAccessPolicy(client, tenantId)` in `apps/web/src/lib/access-policy/data.ts` returns
  `{ policy, metadata }`, with `policy` validated through `accessPolicySchema` and `metadata` `null` for anyone who is not
  an `access_config` admin. Nothing visible was added for residents.
- Layout: full width; at ≥ 1280 px the matrix is a 7-column grid with column headers; below it each visitor type is a
  stacked card (modes in a 2/4-column grid). Touch targets ≥ 44 px (asserted in e2e at both widths). State is shown with
  icon/text/switch position, never by color only.

## Files

- `apps/web/src/app/(app)/settings/access-policy/{page,actions}.ts(x)`, `…/history/page.tsx`, `settings/page.tsx`
- `apps/web/src/components/access-policy/{policy-editor,change-list,history-list}.tsx`
- `apps/web/src/lib/access-policy/{rules,data,errors,scope}.ts` — UI rules (`toggleMode`, limit parsing, diff-path
  parsing), loaders, error mapping, request scope. Kept in `apps/web/src/lib` (not `packages/domain`) so this task does not
  touch the `packages/domain` exports that T22 owns; a unit test cross-checks `isModeSelectable` against `validatePolicy`
  for every visitor type × mode so the two cannot drift. Move it to the domain package when mobile needs it.
- `apps/web/messages/access-policy.es-AR.json` (own top-level key `accessPolicy`, wired in `i18n/request.ts`,
  `next-intl.d.ts`, `test/render.tsx`, `messages.test.ts`).
- Tests: `rules.test.ts`, `data.test.ts`, `access-policy.test.tsx` (component), `e2e/access-policy.spec.ts`,
  `e2e/screenshots-h3.spec.ts` (opt-in `E2E_SCREENSHOTS=1`) → `docs/screenshots/h3/` (matrix, template diff, history,
  read-only; 1440 and 360).

## Decisions / things to know

- The e2e mutates a **disposable barrio** (created with `access_config` + `registry`), restores its balanced policy through
  the authenticated RPC in teardown, then deletes its fixture; the seeded barrios are only read (Los Ceibos = Equilibrado/90 s via `admin.ceibos`, Las Tipas = Estricto/120 s
  via the seeded `admin.tipas`). The non-`access_config` case uses the seeded `registry.ceibos` (registry-only admin):
  read-only page, no entry, history 404, and its RPC calls on Los Ceibos (`apply_access_policy_template` balanced — a no-op
  had it succeeded — and `access_policy_history`) are refused with `42501`. A client that skips the UI and sends an
  `unknown` rule with direct entry gets `22023`.
- Who changed it: names come from `person` through the viewer's own RLS client, so an `access_config`-only admin sees the
  role label instead of a name. No `service_role`, no extra RPC.
- A tenant that is not writable (suspended/cancelled) is shown read-only, history stays readable (contract: suspended reads
  allowed).
- Not done (outside this task): the resident-facing consumer (M04) and server enforcement of the limits (M04/M05).
- This branch merges official T22 commit `7da9935` through main merge `a787d79`. Temporary domain/client copies were removed
  before merging; the UI consumes the official exports and generated database types without changes to them.

## Acceptance

Final verification: 2026-10-11, official T22 contract integrated. All commands ran locally; no database reset,
schema edits, staging operations, or push. Existing Edge Functions were reachable, so no additional server was started.

| Check                                                                                                                        | Result                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                                                                  | PASS, six tasks; rerun after the final e2e teardown change                                                             |
| `pnpm typecheck`                                                                                                             | PASS, six tasks; rerun after the final e2e teardown change                                                             |
| `pnpm test`                                                                                                                  | PASS, 1,046 tests: web 753, domain 193, Supabase 44, observability 30, tokens 26                                       |
| Domain coverage                                                                                                              | 99.80% statements, 98.63% branches, 100% functions/lines; access-policy executable code 100%                           |
| `pnpm build`                                                                                                                 | PASS, production build with 44 routes/pages including both policy routes                                               |
| `E2E_PORT=3001 pnpm test:e2e`                                                                                                | PASS, 186 passed in 6.4 min; 56 opt-in documentation captures skipped                                                  |
| `E2E_PORT=3001 E2E_SCREENSHOTS=1 pnpm --filter @domus/web exec playwright test access-policy.spec.ts screenshots-h3.spec.ts` | PASS, 22 passed in 29.3 s; verifies the final restoring teardown and regenerates all eight H3 captures                 |
| Visual inspection                                                                                                            | Desktop matrix/history and both template sheets verified; the mobile preview scrolls while Cancel/Apply remain visible |
| `git diff --check`                                                                                                           | PASS                                                                                                                   |

The first post-merge unit run hit a timing failure in the existing MFA invalid-code component test; the subsequent
full run passed all 753 web tests without changing that unrelated test. Existing Node localstorage-file and Playwright
color-environment warnings do not affect the passing results.

Runtime: Node 25.2.1, pnpm 11.11.0, Next.js 16.4.0, React 19.3.0, Turborepo 2.11.7, Vitest 4.1.11,
Playwright 1.63.0, Supabase CLI 2.120.0. The installed Next.js and Turbo documentation was read before execution.

Ready for coordinator integration and HR-03 review of the proposed D25 templates. M04/M05 consumers remain outside T23.
