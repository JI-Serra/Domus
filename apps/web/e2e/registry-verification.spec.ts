import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cleanUp, withDatabase } from './support/database';
import {
  expectNoHorizontalOverflow,
  formAlert,
  loginWithPassword,
} from './support/flows';
import {
  createRegistryAdmin,
  openRegistrySection,
  uniqueSuffix,
} from './support/registry';
import type { RegistryAdmin } from './support/registry';
import { createDisposableUser, signedInClient } from './support/supabase';

// T19: claims that collide with another record wait on /registry/verification, and an approval that finds such a
// collision stays pending with a link there. The rows are placed straight in the local database: they are what
// household members' declarations leave behind.
test.describe
  .serial('pending verification and identity conflicts (T19)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let suffix: string;
  let page: Page;
  let doc: string;
  let unitOne: string;
  const emails: string[] = [];
  const peopleList = () => page.getByRole('list', { name: 'Personas' });
  const vehicleList = () => page.getByRole('list', { name: 'Vehículos' });

  async function seed() {
    return withDatabase(async (db) => {
      const tenantId = admin.tenantId;
      const unit = async (code: string) =>
        (
          await db.query<{ unit_id: string }>(
            `insert into public.unit (tenant_id, unit_code) values ($1, $2) returning unit_id`,
            [tenantId, code],
          )
        ).rows[0]?.unit_id as string;
      const person = async (
        first: string,
        last: string,
        columns: Record<string, string | null> = {},
      ) => {
        const names = [
          'person_first_name',
          'person_last_name',
          ...Object.keys(columns),
        ];
        const values = [first, last, ...Object.values(columns)];
        return (
          await db.query<{ person_id: string }>(
            `insert into public.person (tenant_id, ${names.join(', ')})
             values ($1, ${values.map((_, i) => `$${i + 2}`).join(', ')}) returning person_id`,
            [tenantId, ...values],
          )
        ).rows[0]?.person_id as string;
      };
      const resident = (unitId: string, personId: string, holder = false) =>
        db.query(
          `insert into public.unit_resident (tenant_id, unit_id, person_id, unit_resident_relationship,
             unit_resident_is_holder, unit_resident_valid_from_at)
           values ($1, $2, $3, 'family', $4, '2020-01-01T00:00:00Z')`,
          [tenantId, unitId, personId, holder],
        );

      const one = await unit(`V1-${suffix}`);
      const two = await unit(`V2-${suffix}`);
      unitOne = one;
      const holder = await person('Quinn', 'Titular', {
        person_document_type: 'dni',
        person_document_number: doc,
        person_email: `quinn.${suffix}@ejemplo.test`,
      });
      await resident(one, holder);
      // Declared document that somebody else already holds (cannot be accepted).
      const collides = await person('Ana', 'Choque', {
        person_claimed_document_type: 'dni',
        person_claimed_document_number: doc,
      });
      await resident(one, collides);
      // Declared email nobody holds (can be accepted).
      const free = await person('Beto', 'Libre', {
        person_email: `old.${suffix}@ejemplo.test`,
        person_claimed_email: `new.${suffix}@ejemplo.test`,
      });
      await resident(one, free);
      // Registered data to keep.
      const keep = await person('Cora', 'Conserva', {
        person_document_type: 'dni',
        person_document_number: `9${doc}`,
        person_claimed_document_type: 'dni',
        person_claimed_document_number: doc,
      });
      await resident(two, keep);

      const vehicle = (unitId: string, plate: string, verified: boolean) =>
        db.query(
          `insert into public.vehicle (tenant_id, unit_id, vehicle_plate_code, vehicle_is_verified)
           values ($1, $2, $3, $4)`,
          [tenantId, unitId, plate, verified],
        );
      await vehicle(one, 'AA111AA', true);
      await vehicle(two, 'AA111AA', false);
      await vehicle(two, 'BB222BB', false);

      // Household delegations for the 360 view: a holder account, a member with grants, a member without.
      const account = async (personId: string, role: string) =>
        (
          await db.query<{ membership_id: string }>(
            `insert into public.membership (tenant_id, person_id, membership_role, unit_id, membership_valid_from)
             values ($1, $2, $3, $4, '2020-01-01T00:00:00Z') returning membership_id`,
            [tenantId, personId, role, one],
          )
        ).rows[0]?.membership_id as string;
      const holderAccount = await person('Hilda', 'Holder');
      await resident(one, holderAccount, true);
      await account(holderAccount, 'unit_holder');
      const granted = await person('Gina', 'Delegada');
      await resident(one, granted);
      const grantedMembership = await account(granted, 'household_member');
      await db.query(
        `insert into public.membership_household_permission (tenant_id, membership_id, membership_household_permission_permission)
         values ($1, $2, 'view_unit_finance'), ($1, $2, 'book_amenities')`,
        [tenantId, grantedMembership],
      );
      const plain = await person('Nora', 'Sinpermisos');
      await resident(one, plain);
      await account(plain, 'household_member');
    });
  }

  test.beforeAll(async ({ browser }, testInfo) => {
    suffix = uniqueSuffix(testInfo);
    doc = `4${suffix}`.slice(0, 8);
    admin = await createRegistryAdmin(`Barrio Verificacion ${suffix}`);
    emails.push(admin.email);
    await seed();
    const context = await browser.newContext({
      ...testInfo.project.use,
      locale: 'es-AR',
    });
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    await page?.context().close();
    await cleanUp({ tenantIds: [admin.tenantId], emails });
  });

  test('lists what is waiting, with what is registered, what was declared and who holds it', async () => {
    await openRegistrySection(page, 'Verificación');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Pendientes de verificación',
    );
    await expect(peopleList().getByRole('listitem')).toHaveCount(3);
    const choque = peopleList()
      .getByRole('listitem')
      .filter({ hasText: 'Ana Choque' });
    await expect(choque).toContainText(`DNI ${doc}`);
    await expect(choque).toContainText('Ya lo tiene:');
    await expect(choque).toContainText('Quinn Titular');
    await expect(
      choque.getByRole('link', { name: `V1-${suffix}` }).first(),
    ).toBeVisible();
    await expect(vehicleList().getByRole('listitem')).toHaveCount(2);
    await expect(vehicleList()).toContainText('AA111AA');
    await expect(
      vehicleList()
        .getByRole('listitem')
        .filter({ hasText: 'AA111AA' })
        .getByRole('link', { name: `V1-${suffix}` }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('people: a taken document cannot be accepted; free data can; registered data can be kept', async () => {
    await page.goto('/registry/verification');
    await page
      .getByRole('button', { name: 'Usar los datos declarados de Ana Choque' })
      .click();
    await expect(formAlert(page)).toContainText(
      'Otra persona ya tiene ese documento o email',
    );
    await expect(peopleList()).toContainText('Ana Choque');

    await page
      .getByRole('button', { name: 'Usar los datos declarados de Beto Libre' })
      .click();
    await expect(page.getByText('Datos declarados aceptados.')).toBeVisible();
    await expect(peopleList()).not.toContainText('Beto Libre');

    await page
      .getByRole('button', {
        name: 'Conservar los datos registrados de Cora Conserva',
      })
      .click();
    await expect(
      page.getByText('Se conservaron los datos registrados.'),
    ).toBeVisible();
    await expect(peopleList()).not.toContainText('Cora Conserva');
    await expect(peopleList().getByRole('listitem')).toHaveCount(1);

    const { rows } = await withDatabase((db) =>
      db.query<{
        person_first_name: string;
        person_email: string | null;
        person_document_number: string | null;
      }>(
        `select person_first_name, person_email, person_document_number from public.person
          where tenant_id = $1 and person_first_name in ('Beto', 'Cora')`,
        [admin.tenantId],
      ),
    );
    const byName = Object.fromEntries(
      rows.map((row) => [row.person_first_name, row]),
    );
    expect(byName.Beto?.person_email).toBe(`new.${suffix}@ejemplo.test`);
    expect(byName.Cora?.person_document_number).toBe(`9${doc}`);
  });

  test('vehicles: a plate held by a verified vehicle cannot be verified; discard it; a free plate verifies', async () => {
    await page.reload();
    await page
      .getByRole('button', { name: 'Verificar la patente AA111AA' })
      .click();
    await expect(formAlert(page)).toContainText(
      'Otro vehículo verificado ya tiene esa patente',
    );
    await page
      .getByRole('button', {
        name: 'Descartar el reclamo de la patente AA111AA',
      })
      .click();
    await expect(page.getByText('Reclamo descartado.')).toBeVisible();
    await expect(vehicleList()).not.toContainText('AA111AA');

    await page
      .getByRole('button', { name: 'Verificar la patente BB222BB' })
      .click();
    await expect(page.getByText('Patente verificada.')).toBeVisible();
    await expect(page.getByText('No hay vehículos pendientes.')).toBeVisible();

    const { rows } = await withDatabase((db) =>
      db.query<{
        vehicle_plate_code: string;
        vehicle_is_verified: boolean;
        archived: boolean;
      }>(
        `select vehicle_plate_code, vehicle_is_verified, vehicle_archived_at is not null as archived
           from public.vehicle where tenant_id = $1 order by vehicle_plate_code, vehicle_is_verified`,
        [admin.tenantId],
      ),
    );
    expect(rows).toEqual([
      {
        vehicle_plate_code: 'AA111AA',
        vehicle_is_verified: false,
        archived: true,
      },
      {
        vehicle_plate_code: 'AA111AA',
        vehicle_is_verified: true,
        archived: false,
      },
      {
        vehicle_plate_code: 'BB222BB',
        vehicle_is_verified: true,
        archived: false,
      },
    ]);
    await expectNoHorizontalOverflow(page);
  });

  test('a join request whose identity collides stays pending, says so, and leads to the list', async () => {
    const applicant = await createDisposableUser();
    emails.push(applicant.email);

    await page.goto(`/registry/units/${unitOne}`);
    await page.getByRole('button', { name: 'Código de la unidad' }).click();
    await page.getByRole('button', { name: 'Generar código' }).click();
    const code =
      (await page.getByTestId('one-time-secret').textContent()) ?? '';
    await page.getByRole('button', { name: 'Ocultar' }).click();

    const client = await signedInClient(applicant.email);
    const { error } = await client.rpc('submit_unit_join_request', {
      target_tenant_id: admin.tenantId,
      join_code: code,
      person_data: {
        person_first_name: 'Raúl',
        person_last_name: 'Repetido',
        person_document_type: 'dni',
        person_document_number: doc,
      },
      client_event_id: crypto.randomUUID(),
    });
    expect(error).toBeNull();

    await page.reload();
    const requests = page.getByRole('region', {
      name: 'Solicitudes de ingreso',
    });
    await expect(requests).toContainText('Raúl Repetido');
    await page.getByRole('button', { name: 'Aprobar a Raúl Repetido' }).click();

    const alert = formAlert(page);
    await expect(alert).toContainText(
      'Conflicto de identidad: requiere revisión',
    );
    await expect(requests).toContainText('Raúl Repetido');
    await expect(page.getByText(/Solicitud aprobada/)).toHaveCount(0);

    // Nothing was created: no invitation, no new person.
    const { rows } = await withDatabase((db) =>
      db.query<{ count: string }>(
        `select count(*) from public.person where tenant_id = $1 and person_last_name = 'Repetido'`,
        [admin.tenantId],
      ),
    );
    expect(Number(rows[0]?.count)).toBe(0);
    await expect(
      page.getByRole('region', { name: 'Invitaciones pendientes' }),
    ).toContainText('No hay invitaciones pendientes.');

    await alert
      .getByRole('link', { name: 'Ver pendientes de verificación' })
      .click();
    await expect(page).toHaveURL(/\/registry\/verification$/);
    await expectNoHorizontalOverflow(page);
  });

  test('the unit sheet shows what each member was delegated, read-only', async () => {
    await page.goto(`/registry/units/${unitOne}`);
    const accounts = page.getByRole('list', { name: 'Cuentas' });
    const holder = accounts
      .getByRole('listitem')
      .filter({ hasText: 'Hilda Holder' });
    await expect(holder).toContainText('Todos los permisos (titular)');
    const granted = accounts
      .getByRole('listitem')
      .filter({ hasText: 'Gina Delegada' });
    await expect(granted).toContainText('Ver finanzas · Reservar amenities');
    const plain = accounts
      .getByRole('listitem')
      .filter({ hasText: 'Nora Sinpermisos' });
    await expect(plain).toContainText('Sin permisos delegados');
    // Read-only here: the household manages them in Mi hogar.
    await expect(accounts.getByRole('switch')).toHaveCount(0);
    await expect(accounts.getByRole('button')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
