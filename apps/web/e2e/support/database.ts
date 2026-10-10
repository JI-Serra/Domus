import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Direct connection to the LOCAL database, for test setup only (never application code): fixtures that the app
 * cannot create by itself, such as a platform admin or a barrio in a given subscription status. It connects as the
 * local `postgres` superuser, so it must never be pointed at staging; the guard below enforces that.
 */
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

if (!/@(127\.0\.0\.1|localhost)[:/]/.test(DATABASE_URL))
  throw new Error('e2e database helpers only run against the local stack');

export async function withDatabase<T>(
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export type TenantSubscriptionStatus =
  'pilot' | 'active' | 'suspended' | 'cancelled';

/** Makes the user an active platform admin (what the seed does for platform@domus.local). */
export async function makePlatformAdmin(userId: string): Promise<void> {
  await withDatabase((db) =>
    db.query(
      'insert into public.platform_admin (user_id) values ($1) on conflict (user_id) do nothing',
      [userId],
    ),
  );
}

/** A fresh barrio so status changes never touch the seeded ones other suites rely on. */
export async function createTenant(
  name: string,
  status: TenantSubscriptionStatus = 'active',
): Promise<{ tenantId: string; tenantName: string }> {
  const tenantId = randomUUID();
  const slug = `e2e-${tenantId.slice(0, 8)}`;
  await withDatabase((db) =>
    db.query(
      `insert into public.tenant (tenant_id, tenant_name, tenant_slug, tenant_subscription_status)
       values ($1, $2, $3, $4)`,
      [tenantId, name, slug, status],
    ),
  );
  return { tenantId, tenantName: name };
}

export async function setTenantStatus(
  tenantId: string,
  status: TenantSubscriptionStatus,
): Promise<void> {
  await withDatabase((db) =>
    db.query(
      'update public.tenant set tenant_subscription_status = $2 where tenant_id = $1',
      [tenantId, status],
    ),
  );
}

/** Gives the user an active membership with `role` in the tenant (creating the person row it hangs from). */
export async function addMembership(
  userId: string,
  tenantId: string,
  role: 'tenant_admin' | 'guard' | 'unit_holder' | 'household_member',
  name: { first: string; last: string } = { first: 'Prueba', last: 'E2E' },
): Promise<void> {
  await withDatabase(async (db) => {
    const personId = randomUUID();
    await db.query(
      `insert into public.person (person_id, tenant_id, user_id, person_first_name, person_last_name,
         person_document_type, person_document_number)
       values ($1, $2, $3, $5, $6, 'dni', $4)`,
      [
        personId,
        tenantId,
        userId,
        String(Date.now()).slice(-8),
        name.first,
        name.last,
      ],
    );
    await db.query(
      `insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from)
       values ($1, $2, $3, '2020-01-01T00:00:00Z')`,
      [tenantId, personId, role],
    );
  });
}

/** Id of the auth user with this email (test setup only). */
export async function userIdByEmail(email: string): Promise<string> {
  const { rows } = await withDatabase((db) =>
    db.query<{ id: string }>('select id from auth.users where email = $1', [
      email,
    ]),
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user with email ${email}`);
  return id;
}

/** The tenant created through the UI, found by name. */
export async function tenantIdByName(name: string): Promise<string> {
  const { rows } = await withDatabase((db) =>
    db.query<{ tenant_id: string }>(
      'select tenant_id from public.tenant where tenant_name = $1',
      [name],
    ),
  );
  const id = rows[0]?.tenant_id;
  if (!id) throw new Error(`No tenant named ${name}`);
  return id;
}

export interface AuditRow {
  audit_event_actor_user_id: string | null;
  audit_event_on_behalf_of_user_id: string | null;
  support_session_id: string | null;
  audit_event_table_name: string;
  audit_event_action: string;
  tenant_id: string | null;
}

/** Audit events of a support session, for the test that must prove the platform admin is the real actor. */
export async function auditEventsForSession(
  sessionId: string,
): Promise<AuditRow[]> {
  const { rows } = await withDatabase((db) =>
    db.query<AuditRow>(
      `select audit_event_actor_user_id, audit_event_on_behalf_of_user_id, support_session_id,
              audit_event_table_name, audit_event_action, tenant_id
         from public.audit_event where support_session_id = $1 order by audit_event_occurred_at`,
      [sessionId],
    ),
  );
  return rows;
}

/**
 * Removes what a test created: the barrios (with their invitations, support sessions, people and memberships) and
 * the disposable accounts. Audit events are append-only by design and stay; logo objects are removed through the
 * Storage API by the test that uploaded them.
 */
export async function cleanUp(options: {
  tenantIds?: readonly string[];
  emails?: readonly string[];
}): Promise<void> {
  const tenantIds = [...(options.tenantIds ?? [])];
  const emails = [...(options.emails ?? [])];
  await withDatabase(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'select id from auth.users where email = any($1)',
      [emails],
    );
    const userIds = rows.map((row) => row.id);
    await db.query('begin');
    try {
      await db.query(
        'delete from public.support_session where tenant_id = any($1) or support_session_actor_user_id = any($2)',
        [tenantIds, userIds],
      );
      await db.query(
        'delete from public.invitation where tenant_id = any($1)',
        [tenantIds],
      );
      await db.query(
        'delete from public.membership_permission where tenant_id = any($1)',
        [tenantIds],
      );
      await db.query(
        'delete from public.membership where tenant_id = any($1)',
        [tenantIds],
      );
      await db.query('delete from public.person where tenant_id = any($1)', [
        tenantIds,
      ]);
      await db.query('delete from public.tenant where tenant_id = any($1)', [
        tenantIds,
      ]);
      await db.query(
        'delete from public.platform_admin where user_id = any($1)',
        [userIds],
      );
      await db.query('delete from auth.users where id = any($1)', [userIds]);
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  });
}

/** Gives the user's active membership in the tenant an administrative permission (e.g. `access_audit`). */
export async function grantPermission(
  userId: string,
  tenantId: string,
  permission: string,
): Promise<void> {
  await withDatabase((db) =>
    db.query(
      `insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
       select m.tenant_id, m.membership_id, $3::public.admin_permission
         from public.membership m join public.person p using (tenant_id, person_id)
        where m.tenant_id = $1 and p.user_id = $2`,
      [tenantId, userId, permission],
    ),
  );
}
