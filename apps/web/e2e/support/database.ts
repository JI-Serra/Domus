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
): Promise<void> {
  await withDatabase(async (db) => {
    const personId = randomUUID();
    await db.query(
      `insert into public.person (person_id, tenant_id, user_id, person_first_name, person_last_name,
         person_document_type, person_document_number)
       values ($1, $2, $3, 'Prueba', 'E2E', 'dni', $4)`,
      [personId, tenantId, userId, String(Date.now()).slice(-8)],
    );
    await db.query(
      `insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from)
       values ($1, $2, $3, '2020-01-01T00:00:00Z')`,
      [tenantId, personId, role],
    );
  });
}
