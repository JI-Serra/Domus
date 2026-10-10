# T17 — Security review of M02 (registry database and functions)

Reviewer: independent agent, 2026-10-10. Scope on `main` (`639349c`, T14 commits `588adc8..639349c`):
`supabase/migrations/20261011000000..08_*.sql`, the replaced H1 functions (`accept_invitation`,
`invitation_grant_is_valid`, `update_membership`, `audit_redacted_columns`, storage policies),
`supabase/functions/_shared/platform.ts` (resident invitation branch), `supabase/tests/registry*.sql`,
`supabase/probes/**`, `supabase/seed.sql` and `supabase/fixtures/**`. I measured it against `AGENTS.md`, spec §5.2,
§6, §9.2, §12, M02, D17, D22, D23, D24, and the author contract `reports/M02-db.md`.

Method: I read every new migration and the live definitions of the H1 identity helpers they depend on. I ran probes
as `postgres` via `docker exec supabase_db_domus psql`, impersonating users with `set local role authenticated` +
`request.jwt.claims`. Every probe ran inside a transaction that was **rolled back**. Test identities (outsider
accounts) were inserted into `auth.users` inside those transactions only. I did not reset, restart or stop anything.

Limits:

- **The shared DB has drifted from `main`.** During the review, another worker (`h2-t18-contract`) applied two
  uncommitted migrations, `20261011000009_registry_join_cancellation_status` and
  `20261011000010_registry_resident_contract`. They change the `submit_unit_join_request` signature (the tenant is
  now optional and last), add `my_unit_join_requests` / `cancel_unit_join_request`, and replace `unit_sheet`. The
  functions behind my findings (`decide_unit_join_request`, `save_resident`, `create_resident_invitation`,
  `accept_invitation`, `save_vehicle`, import) are unchanged by that drift. Probe P1 ran before the drift. P5
  re-ran the same chain with named arguments after it.
- `pnpm test:db` on the drifted DB: 851 assertions, 14 files. `registry_onboarding` and `registry_security` abort
  on the old positional `submit_unit_join_request` call (drift). `backoffice` tests 25 and 41 fail because they
  count audit rows, and the concurrent e2e runs on 3001/3002 write those rows. The author's clean-stack result
  (905 assertions passing) could not be reproduced on this shared stack. That is not caused by M02.
- I did not re-run the HTTP probes (`http-security.test.mjs`, `registry-scale.mjs`), to avoid adding load and rows
  to the stack the UI workers share. For HTTP-specific claims I relied on the PostgREST configuration (below) and
  on code reading.

## Verdict: **approve with fixes** (H1 blocks HR-02 / any real join-code onboarding)

The structural design is strong:

- Every new table has RLS, a composite tenant FK, and a revoke-all/RPC-only write path.
- An isolated NOLOGIN/NOINHERIT `registry_writer` owns the RPCs, and authorization runs before target lookup.
- Retry receipts are bound to actor, tenant, operation and payload.
- The occupied-holder invariant is enforced by a deferred, always-enabled constraint trigger over future coverage.
- The D24 guard projection is real, and minors are blocked at four layers.

The weak spot is **identity resolution**. Natural-key matching (document number or email) is used as if it proved
who someone is. Two onboarding paths let one actor attach their account to an existing, still-unbound person
record that belongs to someone else:

- An outsider, through join-code approval (H1).
- A holder, through resident invitations (M1).

Because audit correctly redacts the old PII values, the overwritten identity data cannot be recovered afterwards.

| #   | Severity | Title                                                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| H1  | High     | Join-request approval merges the applicant into any existing unbound person matched by a typed document number           |
| M1  | Medium   | A holder can bind co-holders and residents of other units to a mailbox of their choice (lockout + identity capture)      |
| L1  | Low      | Holder-reachable existence oracles: tenant-wide document/email lookup and tenant-wide plate uniqueness (incl. archived)  |
| L2  | Low      | Import skips the self-role guard for residences the importer doesn't have yet                                            |
| L3  | Low      | Holders can reverse a registry-recorded minority and rewrite bound adult members' identity data                          |
| L4  | Low      | `guard_backup_contact` is unthrottled and bound only to a constant string: a guard can harvest every backup phone        |
| L5  | Low      | Storage names / `pet_photo_path` accept `..` segments; free-text fields are unbounded; staged import PII is never purged |
| I1  | Info     | The tenant-wide join failure counter has no effect; D22 rate limiting is per-user only                                   |
| I2  | Info     | Imported values are stored raw (`=HYPERLINK(...)` accepted); a future CSV/XLSX export must neutralize formulas           |
| I3  | Info     | Contract/behavior notes (guard_registry roles, pairing not tied to gate assignment, pending requests on archive)         |

---

## High

### H1 — Join-request approval resolves the applicant by an unproven document number and takes over that person

**Location:**

- `20261011000004_registry_invitations.sql:274-282` (`decide_unit_join_request` passes the applicant's typed
  `person_document_*` and email into `save_resident`).
- `20261011000003_registry_rpcs.sql:19-26` (`save_resident` natural lookup:
  `document match OR email match ... order by person_id limit 1`).
- `20261011000003_registry_rpcs.sql:38-41` (`save_resident` overwrites the selected person's name, document, email,
  phone and birth date).
- `create_resident_invitation` then accepts any unbound target (`p.user_id is null`). `accept_invitation` binds it.

**Root cause:** D22 says a join code only _requests_ review. But approval does not create the applicant's person.
It looks up an **existing** tenant person by the applicant-supplied document number and silently overwrites it
with the applicant's data. That includes their verified email, which becomes the victim's `person_email`. Approval
then issues the invitation for that existing person, so the applicant's Auth account is bound to the victim's
person row. A document number is not a secret in Argentina, and nothing in the request proves ownership of it.

The approver cannot see that a merge will happen. Neither `unit_sheet.pending_join_requests` nor the decision
result says "this matches existing person X of unit Y". Because `person` audit redacts names, email and document
(correctly, per AGENTS.md), the victim's previous name and email are **unrecoverable** from audit.

- **Registry approver:** any unbound person in the tenant can be captured. That includes holders of other units,
  imported residents who haven't onboarded yet, and people whose data was recorded but never invited.
- **Holder approver:** limited to unbound non-holder members of the same unit who have no other residence (the
  holder branch of `save_resident`). Same mechanism, smaller blast radius.
- **Bound persons** (with an account) are protected, because `create_resident_invitation` then requires the
  recipient to match the bound account's email, and the decision rolls back.

**Scenario (outsider → holder of a different unit):**

1. The attacker obtains any unit's join code: their friend's unit, a leaked flyer, or their own household as a
   tenant.
2. They submit a join request with their own name and the DNI of a neighbor who is the unbound holder of another
   lot.
3. A registry admin approves "Juan Atacante" for the requested unit as `household_member`.
4. The neighbor's person row is renamed to the attacker. Its email becomes the attacker's, and it is bound to the
   attacker's account on acceptance. The attacker now sees the victim's residency in the other unit (and the
   victim's DNI, phone and birth date where recorded).
5. When the registry later onboards "the holder of Lote 3", the registry shows the attacker's name and email for
   that person. The invitation goes to the attacker, who becomes **unit holder of the victim's lot**. The real
   neighbor is locked out: any invitation to their real mailbox is denied, because the person is bound to another
   account.

**Evidence** (probes P1 and P5, rolled back; user 12 = registry-only admin, user 4 = holder of Lote 1,
`b1…03` = unbound holder of Lote 3, DNI 70001003):

```
victim before            | user_id=∅ | Martin Ruiz    | resident.1.3@domus.local | 70001003
submit (attacker, DNI 70001003, name "Juan Atacante") -> {"status":"pending"}
decide (user 12, approve)                             -> {"status":"approved","person_id":"b1000000-…-000000000003",…}
victim after approval    | user_id=∅ | Juan Atacante  | attacker@evil.test       | 70001003
accept_invitation (attacker)                          -> membership created
attacker reads person    | Juan | 70001003 | attacker@evil.test
attacker reads residency | a1…03 holder=t | a1…01 holder=f
search_registry('Atacante') -> Juan Atacante | attacker@evil.test | Mz 1 Lote 3   (and Lote 1)
registry invites holder of Lote 3 to the recorded email -> accepted holder
attacker holder_unit_ids() = {a1000000-0000-0000-0000-000000000003}
audit person update diff: {"person_email":{"changed":true},"person_last_name":{"changed":true},"person_first_name":{"changed":true}}
```

**Fix:**

- In `decide_unit_join_request`, never resolve the applicant through `save_resident`'s natural lookup. Either
  create a **new** person, or reuse an existing person only when that person is the applicant's own: matched by
  the **verified** email, unbound, and with no conflicting document.
- If the typed document (or email) collides with an existing person, return a distinct decision result (for
  example `identity_conflict` with the matched unit codes, visible only to registry) so a registry admin can
  resolve it explicitly with a chosen `person_id`. A holder approver should be refused.
- Never overwrite identity fields (name, document, email, birth date) of an existing person from applicant data.
- More generally, `save_resident`'s "document OR email, `limit 1`" lookup also merges silently when the two keys
  point at different people. Raise a conflict in that case instead (import already does: `person_identity_conflict`).
- Add tests "Missing tests" #1–#2.

---

## Medium

### M1 — A holder can bind any unbound resident of their unit to an arbitrary mailbox

**Location:** `20261011000004_registry_invitations.sql:35-43` (`create_resident_invitation` target query) and
`accept_invitation:143-149`.

**Root cause:** `save_resident` deliberately prevents a holder from editing a **holder** or a person who also
resides in **another unit** (`20261011000003:29-33`). `create_resident_invitation` has no such restriction:

- It accepts any unbound adult resident of the unit for role `household_member`, including co-holders.
- It accepts any recipient email, even when the person has a recorded `person_email` that differs.

Accepting binds that person's identity to whoever controls the mailbox, permanently (H1 anti-rebinding).

**Scenario:**

- **Co-holder lockout.** A spouse/co-owner is a recorded, unbound co-holder. The other holder invites them as
  `household_member` to an alt mailbox and accepts. The real co-holder can never be onboarded: a registry
  `unit_holder` invitation to their real mailbox is denied. Meanwhile the alt account holds their identity.
- **Multi-unit person.** The registry recorded P as holder of Lote 3 and as family in Lote 1. The Lote 1 holder
  captures P's identity and reads P's residency (holder of Lote 3) and recorded personal data. This puts P's real
  onboarding as holder of Lote 3 in the same position as H1 step 5.

**Evidence** (probe P2, rolled back; holder 4 of Lote 1):

```
holder edits P via save_resident (expected denied): 42501 Registry management denied
holder invites multi-unit P and co-holder Q as household_member to own alt mailboxes: tP 64, tQ 64
accept P (holder.alt)  -> membership;  alt reads residency: a1…03 holder=t | a1…01 holder=f
accept Q (holder.alt2) -> membership;  alt2 reads Q: 71111111 | +54 9 381 0000 | 1980-02-02
registry later invites the real co-holder Q (unit_holder, real mailbox): 42501 Invitation management denied
```

**Fix:**

- For non-registry callers, apply the same target restrictions as `save_resident`: the target must not be a
  holder, and must have no residence in another unit.
- When `person_email` is recorded, require `recipient = person_email`, or require registry for a different
  address.
- Consider requiring registry for any invitation whose target already has a recorded email or document that
  differs from the recipient.

---

## Low

### L1 — Holder-reachable existence oracles and plate squatting

- `save_resident` (holder): a document number or email that exists anywhere in the tenant returns `42501`, while an
  unknown one creates the person. Evidence: `DNI that exists in another unit: 42501` vs `unknown DNI: OK`;
  `existing resident email: 42501`. Any holder can test, unthrottled, whether a DNI/email belongs to someone in the
  barrio.
- `save_vehicle`: `vehicle_tenant_id_vehicle_plate_code_key` is tenant-wide and **includes archived vehicles**.
  - A raw `23505` naming the constraint reveals that a plate exists (`holder registers plate of unit 3: 23505 …`).
  - A holder can pre-register a neighbor's or visitor's plate and block its legitimate registration.
  - An archived plate blocks re-registration in another unit. This matters once M05 decides access by plate.
- **Fix:**
  - Make the plate key partial (`where vehicle_archived_at is null`).
  - Map the conflict to the uniform `42501` (or a `plate_unavailable` code) through registry review.
  - Throttle or audit holder natural-key misses.

### L2 — Import bypasses the self-role guard for new residences

`validate_registry_import`'s `self_role_change` check only fires when the importer **already** resides in the
row's unit (`20261011000006:107-115`). `save_resident` refuses any self `unit_resident_is_holder` change.
Evidence (P4):

- Registry-only admin 12 imported themselves as holder of `Mz 1 Lote 6`: preview errors `[]`, confirm `confirmed`,
  `registry12 residences | Mz 1 Lote 6 | t`.
- In the same import, the bound full administrator's person row was renamed (`=HYPERLINK("http://evil")`).

Every RPC still blocks the self-invitation needed for a membership, so this is integrity, not access. But the
self-made holder record counts toward the occupied-holder invariant. That lets the importer end the real holder's
residence, and it shows them as holder in the sheet.

**Fix:** flag `self_role_change` for any row that matches the caller's own person, regardless of existing
residence. Consider refusing import rows that modify identity fields of persons bound to an Auth user.

### L3 — Holders can reverse registry-recorded minority and rewrite bound members' identity data

Evidence (P4):

- A registry admin set member 5's birth date to 2015. The minor sync revoked the membership.
- Holder 4 then called `save_resident` with `person_birth_date: 1990-01-01, unit_resident_is_minor: false`, and the
  call succeeded (`member 5 after holder edit | f`).
- The holder can now re-invite the person, since the bound account's email matches. The minor regains an account
  and can receive delegations.

Holders can also replace the email, document and phone of adult members who have their own accounts.

**Fix:**

- Let only registry clear a minor flag or move a birth date across the 18-year boundary.
- Holders may add a birth date, but not "un-minor" someone.
- Don't let holders change identity fields of a person bound to another user. That user owns their profile.

### L4 — Backup-phone lookup is unthrottled and bound to a constant string

`guard_backup_contact` accepts any guard of the tenant, for any unit, when given the literal
`approval_phone_fallback`. Evidence: one statement returned all 28 seeded backup phones. Each lookup is audited
(`audit lookups recorded | 28`), which is good, but D24 limits contacts to "solo para la operación". The author
documents this as groundwork for M05.

**Fix (before the pilot):**

- Require a pending approval request for that unit (M05).
- Add a per-guard rate limit through `consume_registry_attempt`.
- Until then, alert on bulk lookups.

### L5 — Hardening: path segments, unbounded text, staged PII retention

- **Path segments.** The storage policies check `foldername(name)[1..2]` only, and `pet_photo_path_check` is a
  prefix `LIKE`. Both accept `<tenant>/<unit>/../<other_unit>/x.png` (P4: upload and `save_pet` both OK). I did
  not confirm whether Storage resolves `..`, so this is hardening only. Require exactly three segments and reject
  `..` and empty segments in both places.
- **Unbounded text.** `save_vehicle` accepted a 100 kB `vehicle_make_name`. Make/model/color, `pet_breed_name`,
  and `unit_block_code`/`unit_lot_number` in `save_unit` have no length checks (import has them). Import keeps
  unknown-field values of any size in `registry_import_row_data`. Add `check(length(...) <= 100)` constraints.
- **Staged PII retention.** `registry_import_row_data` keeps full staged PII (DNI, birth dates, phones) forever
  after confirmation (S5). Purge or redact staged rows after confirmation, or after a TTL for unconfirmed batches.

## Info

- **I1 — the tenant failure counter has no effect.** In `submit_unit_join_request`, both branches of the tenant
  counter return `unavailable`, so it only counts. Per-user throttling (5/15 min, persisted, counted before code
  validation) and 60-bit codes (`get_byte % 32` over 256 values is unbiased) make online guessing infeasible:
  about 2^49 work even with 2,000 live codes in a tenant. Lockout abuse is impossible because the counter is per
  user. Either wire the tenant counter to alerting, or document it as telemetry. The in-flight T18 version makes
  the tenant optional, which puts every tenantless failure under one global `join:tenant:none` key. Retried
  submissions with the same `client_event_id` also consume user attempts.
- **I2 — formula injection, for later.** Values like `=HYPERLINK("http://evil")` import and persist unchanged.
  There is no export yet (no CSV/XLSX code in `apps/web`). The export task must prefix `= + - @ \t \r` cells.
  The UI must render these as text.
- **I3 — contract notes.**
  - `reports/M02-db.md` says `guard_registry` serves "guard or guards administrator", but the code requires the
    `guard` role (`role_tenant_ids(array['guard'])`; P3: a registry-only admin gets `42501`, and a guards
    administrator without the guard role is refused the same way).
  - `redeem_device_pairing` lets any guard pair a device to any active gate, without checking `gate_guard`.
  - Archival leaves pending join requests `pending`; a later decision fails at `save_resident`.
  - Registry-only admins can rename an `admin_management` administrator's person and change their birth date. This
    comes from the H1 person UPDATE policy and `save_resident` (pre-existing H1 behavior, not a regression).

---

## Missing tests

1. A join request carrying the document number of an existing unbound person in another unit:
   - Approval by registry must not change that person.
   - Approval must not issue an invitation for that person.
   - Approval must surface a conflict.
   - The current suite passes with H1 present.
2. The same case where the approver is a holder and the match is an unbound member of the same unit.
3. `save_resident` where the document matches person A and the email matches person B: conflict, not silent
   `limit 1`.
4. A holder `create_resident_invitation` to an unbound co-holder, and to a person with a residence in another unit:
   both denied. Also an invitation to an address different from the recorded `person_email`: denied for holders.
5. Import with the caller's own document as holder of a unit where they have no residence → `self_role_change`.
6. A holder clearing a registry-recorded minor (birth date/flag) → denied.
7. Plate re-registration after archival in another unit; a plate conflict yields a uniform error.
8. Storage names with `..` or extra segments → denied; `pet_photo_path` with `..` → check violation.
9. `guard_backup_contact` throttling, once added.
10. Make `backoffice` audit-count assertions robust to concurrent writers: filter by actor, or by a per-test marker
    instead of a time window. They fail on a shared stack.

## Verified OK

- **Tenant isolation.** P3/P4 and the existing pgTAP matrix: foreign reads return 0 rows on all 13 new tables; foreign
  RPC targets get a uniform `42501`; direct client INSERT/UPDATE/DELETE is denied on every new table; composite
  tenant FKs reject cross-tenant rows even for the owner. Hash tables (`unit_join_code`, `device_pairing`) and
  `device_credential_hash` have no client grants.
- **Role matrix.**
  - Holders cannot manage other units, issue holder invitations, approve as holder, edit holders or other-unit
    residents through `save_resident`, or end their own residence.
  - Members cannot self-grant (`set_household_permissions` → `42501`), write, or rotate codes. They see only
    names of other residents in `unit_sheet`, and only their own `unit_resident` row.
  - The default delegation is `{manage_access_authorizations}` (D23).
  - Registry-only admins cannot reach gates or guard data.
- **D24.** Guards read 1 person (self), 0 units and 1 membership. `guard_registry` returns only unit, name and the
  holder/minor flags, with no document, birth date, email or phone; a foreign tenant gets `42501`;
  `search_registry` gets `42501`. Pet photos: 0 objects visible to guards.
- **Minors.**
  - Birth-date-to-minor via the H1 direct update revokes unit memberships and pending invitations.
  - Delegation to a minor and invitation of a minor are denied; `validate_invitation_resident` is also enforced
    at the trigger.
  - Holder-flag/minor conflict is a table check.
- **Holder invariant.** Ending the sole holder's residence next month fails at flush (`23514`, future coverage).
  Making the sole holder a minor by birth date also fails (`23514`). `lock_resident_unit` serializes concurrent
  resident edits on the unit row, and the deferred check re-reads committed state under READ COMMITTED. The
  triggers are `ENABLE ALWAYS` (replica mode cannot skip them). Deleting a unit is refused.
- **Storage.** Holders upload only to their own `tenant/unit` prefix. The cross-unit prefix and the foreign-tenant
  prefix with the holder's own unit id are both denied. Members cannot upload. A registry admin of A cannot write
  to B.
- **Join code.**
  - 12 base32 characters, 60 bits, uniform.
  - Only the SHA-256 hash persists, and the raw code never appears in audit (test).
  - Rotation invalidates the old code.
  - Every failure shape returns the same `{"status":"unavailable"}`.
  - PostgREST runs with the default `db-tx-end=commit` (no `PGRST_DB_TX_END` override), so `Prefer: tx=rollback`
    cannot undo counters.
  - A GET RPC runs read-only and fails before any lookup, so it is no oracle.
- **Device pairing.** 128-bit single-use code, 10-minute expiry (also a table check), retry rotates without
  extending expiry, redemption locked `FOR UPDATE`, 256-bit device credential returned once and hashed. Sync needs
  both the operator identity and the credential. Revocation, gate deactivation or loss of the guard role apply on
  the next call. Support identities are excluded.
- **Support/suspension.** Support cannot read the target's other tenant, rotate codes, decide joins, create
  resident invitations, pair or sync devices, or see pending onboarding arrays (tests plus code). Suspended tenants
  are readable and reject writes; cancelled tenants are invisible.
- **H1 regressions.**
  - `accept_invitation` keeps the anti-rebinding rule for non-unit invitations, plus the email-proof and
    grantor-authority gate. The new unit branch only lets a person already bound to _the caller_ consent again.
    Other pending invitations for the person are revoked on acceptance.
  - `invitation_grant_is_valid` rejects holder-created invitations once the creator loses holder authority, and
    refuses the platform-admin path for unit invitations.
  - `update_membership` keeps the D17 self/grantor checks and clears `unit_id` for non-resident roles.
- **AGENTS.md rules.**
  - All redefined functions are complete definitions; no `replace()` patching.
  - Policies use set-returning helpers.
  - SECURITY DEFINER RPCs authorize before target lookup or locks, and before reading retry receipts.
  - `registry_writer` is NOLOGIN/NOINHERIT/no BYPASSRLS/no CREATE.
  - anon and service_role cannot execute the new RPCs.
- **Audit and idempotency.**
  - Writes by the registry capability are audited with PII redacted: person names, email, document, phone and
    birth date; plate; photo path; staged rows; all hashes; join-request applicant fields.
  - Receipts store digests and results only; no secrets.
  - Reusing a `client_event_id` across actor, tenant or payload is denied.
- **Import.** Every statement is tenant-scoped, so cross-tenant overwrite is impossible. Conflicting rows block
  confirmation. Confirmation is one transaction under a per-tenant advisory lock, and repeat confirmation returns
  the prior result. Values are bound as data (no dynamic SQL). Size is limited to 1–8,000 rows with a 120-second
  timeout.

## Probe files

The rolled-back probe scripts (P1–P5) live in the reviewer's scratchpad. Each starts with `begin;` and ends with
`rollback;`. They need only the seed identities plus throwaway `auth.users` rows created inside the transaction,
and can be turned into the pgTAP cases above.
