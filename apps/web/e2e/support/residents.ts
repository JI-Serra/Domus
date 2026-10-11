import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMembership, grantPermission, withDatabase } from './database';
import { openAuthLink } from './auth-links';
import { extractAuthLink } from './mailpit';
import { createDisposableUser, signedInClient } from './supabase';

/**
 * Fixtures for the resident flows (M02-F04/F05). They go through the same public RPCs and the `send-invitation`
 * Edge Function the app uses, as a registry administrator of a barrio the test created, so the invitations that
 * reach Mailpit are the real ones.
 */

export interface ResidentFixture {
  tenantId: string;
  unitId: string;
  unitCode: string;
  holderEmail: string;
  holderName: { first: string; last: string };
  /** Signed-in client of the registry administrator (never given to the browser). */
  admin: SupabaseClient;
  adminEmail: string;
}

/** An administrator with the registry permission, an occupied unit with one holder, and the holder's invitation. */
export async function createHouseholdFixture(options: {
  tenantId: string;
  unitCode: string;
  holderEmail: string;
  holderName: { first: string; last: string };
}): Promise<ResidentFixture> {
  const { userId, email: adminEmail } = await createDisposableUser();
  await addMembership(userId, options.tenantId, 'tenant_admin', {
    first: 'Admin',
    last: 'Registro',
  });
  await grantPermission(userId, options.tenantId, 'registry');
  const admin = await signedInClient(adminEmail);

  const unit = await admin.rpc('save_unit', {
    target_tenant_id: options.tenantId,
    unit_data: { unit_code: options.unitCode, unit_status: 'occupied' },
    client_event_id: randomUUID(),
    residents: [
      {
        person: {
          person_first_name: options.holderName.first,
          person_last_name: options.holderName.last,
          person_email: options.holderEmail,
          person_document_type: 'dni',
          person_document_number: String(Date.now()).slice(-8),
        },
        resident: {
          unit_resident_relationship: 'owner',
          unit_resident_is_holder: true,
        },
      },
    ],
  });
  if (unit.error || !unit.data)
    throw new Error(`Could not create the unit: ${unit.error?.message}`);
  const unitId = String(unit.data);

  const holder = await personIdByEmail(options.tenantId, options.holderEmail);
  const invitation = await admin.functions.invoke('send-invitation', {
    body: {
      target_tenant_id: options.tenantId,
      target_unit_id: unitId,
      invited_email: options.holderEmail,
      target_role: 'unit_holder',
      client_event_id: randomUUID(),
      target_person_id: holder,
    },
  });
  if (invitation.error)
    throw new Error(`Could not invite the holder: ${invitation.error.message}`);

  return {
    tenantId: options.tenantId,
    unitId,
    unitCode: options.unitCode,
    holderEmail: options.holderEmail,
    holderName: options.holderName,
    admin,
    adminEmail,
  };
}

export async function personIdByEmail(
  tenantId: string,
  email: string,
): Promise<string> {
  const { rows } = await withDatabase((db) =>
    db.query<{ person_id: string }>(
      'select person_id from public.person where tenant_id = $1 and person_email = $2',
      [tenantId, email],
    ),
  );
  const id = rows[0]?.person_id;
  if (!id) throw new Error(`No person ${email} in the barrio`);
  return id;
}

/** The household membership of the account with this email in the barrio. */
export async function membershipIdOf(
  tenantId: string,
  email: string,
): Promise<string> {
  const { rows } = await withDatabase((db) =>
    db.query<{ membership_id: string }>(
      `select m.membership_id from public.membership m
         join public.person p using (tenant_id, person_id)
         join auth.users u on u.id = p.user_id
        where m.tenant_id = $1 and u.email = $2 and m.membership_status = 'active'`,
      [tenantId, email],
    ),
  );
  const id = rows[0]?.membership_id;
  if (!id) throw new Error(`No active membership for ${email}`);
  return id;
}

/**
 * Opens the invitation email the way a person does, on the app under test. The Edge Function builds its link for the
 * address configured in `DOMUS_APP_URL` (port 3000 on the shared local stack), so the Auth redirect is read instead
 * of followed and replayed on this run's own origin, session fragment included.
 */
export async function openInvitationEmail(
  page: Page,
  emailText: string,
): Promise<void> {
  await openAuthLink(page, extractAuthLink(emailText));
}

/**
 * Removes the barrios of a resident test with everything the registry hangs from them, and the disposable accounts.
 * Units cannot be deleted through the product (they are archived), and the guard that enforces it is disabled only
 * for the second transaction of this helper, on the local test database. Audit events are append-only and stay.
 */
export async function cleanUpResidents(options: {
  tenantIds: readonly string[];
  emails: readonly string[];
}): Promise<void> {
  const tenantIds = [...options.tenantIds];
  const emails = [...options.emails];
  await withDatabase(async (db) => {
    const { rows } = await db.query<{ id: string }>(
      'select id from auth.users where email = any($1)',
      [emails],
    );
    const userIds = rows.map((row) => row.id);
    await db.query('begin');
    try {
      // An occupied unit needs a holder; an archived one does not, so the residents can be removed.
      await db.query(
        'update public.unit set unit_archived_at = now() where tenant_id = any($1)',
        [tenantIds],
      );
      for (const table of [
        'unit_join_request',
        'unit_join_code',
        'vehicle',
        'pet',
        'membership_household_permission',
        'membership_permission',
        'invitation',
        'membership',
        'unit_resident',
        'person',
      ])
        await db.query(
          `delete from public.${table} where tenant_id = any($1)`,
          [tenantIds],
        );
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
    await db.query('begin');
    try {
      await db.query(
        'alter table public.unit disable trigger protect_registry_relationships',
      );
      await db.query('delete from public.unit where tenant_id = any($1)', [
        tenantIds,
      ]);
      await db.query(
        'alter table public.unit enable always trigger protect_registry_relationships',
      );
      await db.query(
        'delete from app_private.registry_operation where tenant_id = any($1)',
        [tenantIds],
      );
      await db.query(
        'delete from public.support_session where tenant_id = any($1)',
        [tenantIds],
      );
      await db.query('delete from public.tenant where tenant_id = any($1)', [
        tenantIds,
      ]);
      await db.query('delete from auth.users where id = any($1)', [userIds]);
      await db.query('commit');
    } catch (error) {
      await db.query('rollback');
      throw error;
    }
  });
}

/** Removes every object of the pet-photo bucket under the unit folder (Storage refuses direct SQL deletes). */
export async function removePetPhotos(
  admin: SupabaseClient,
  tenantId: string,
  unitId: string,
): Promise<void> {
  const folder = `${tenantId}/${unitId}`;
  const { data } = await admin.storage.from('pet-photo').list(folder);
  if (data?.length)
    await admin.storage
      .from('pet-photo')
      .remove(data.map((object) => `${folder}/${object.name}`));
}

/**
 * A second, active holder of the unit with a real account (test setup straight in the local database: the product
 * only creates holders through registry administrators and invitations).
 */
export async function addCoHolder(
  tenantId: string,
  unitId: string,
  name: { first: string; last: string },
): Promise<{ email: string; membershipId: string }> {
  const { userId, email } = await createDisposableUser();
  const membershipId = await withDatabase(async (db) => {
    const personId = randomUUID();
    await db.query(
      `insert into public.person (person_id, tenant_id, user_id, person_first_name, person_last_name,
         person_document_type, person_document_number)
       values ($1, $2, $3, $4, $5, 'dni', $6)`,
      [
        personId,
        tenantId,
        userId,
        name.first,
        name.last,
        String(Date.now()).slice(-8),
      ],
    );
    await db.query(
      `insert into public.unit_resident (tenant_id, unit_id, person_id, unit_resident_relationship, unit_resident_is_holder)
       values ($1, $2, $3, 'owner', true)`,
      [tenantId, unitId, personId],
    );
    const { rows } = await db.query<{ membership_id: string }>(
      `insert into public.membership (tenant_id, person_id, membership_role, unit_id)
       values ($1, $2, 'unit_holder', $3) returning membership_id`,
      [tenantId, personId, unitId],
    );
    return rows[0]?.membership_id ?? '';
  });
  return { email, membershipId };
}
