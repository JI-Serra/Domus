import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import { createTenant } from './support/database';
import {
  contextSelector,
  expectNoHorizontalOverflow,
  loginWithPassword,
  newContext,
  PNG,
  signIn,
} from './support/flows';
import { waitForEmailText } from './support/mailpit';
import {
  cleanUpResidents,
  createHouseholdFixture,
  membershipIdOf,
  openInvitationEmail,
  personIdByEmail,
  removePetPhotos,
} from './support/residents';
import type { ResidentFixture } from './support/residents';
import {
  accessTokenFromCookies,
  clientWithToken,
  createDisposableUser,
} from './support/supabase';

const PASSWORD = 'ClaveSegura123!';
const stamp = `${Date.now()}`.slice(-9);
const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'mobile-360';

// Documentation captures (docs/screenshots/h2): `E2E_SCREENSHOTS=1 pnpm --filter @domus/web exec playwright test resident`.
const SHOTS = Boolean(process.env.E2E_SCREENSHOTS);
const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h2',
);

async function shot(
  target: Page | Locator,
  name: string,
  testInfo: TestInfo,
  theme: 'light' | 'dark' = 'light',
  tall = false,
) {
  if (!SHOTS) return;
  const width = isMobile(testInfo) ? 360 : 1440;
  const file = path.join(OUTPUT, `resident-${name}-${width}-${theme}.png`);
  if (!tall || !('setViewportSize' in target)) {
    await target.screenshot({ path: file });
    return;
  }
  // A tall viewport instead of `fullPage`: sticky bars would otherwise be painted over the middle of the page.
  const original = target.viewportSize();
  await target.setViewportSize({ width, height: width === 360 ? 1900 : 1300 });
  await target.screenshot({ path: file });
  if (original) await target.setViewportSize(original);
}

/** Every button and link in the main area is at least 44 px tall (the touch target of DESIGN.md A.6). */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('main button, main a')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.height < 43.5;
      })
      .map(
        (element) =>
          element.textContent?.trim() || element.getAttribute('aria-label'),
      ),
  );
  expect(small).toEqual([]);
}

const dialogOf = (page: Page, name: string | RegExp) =>
  page.getByRole('dialog', { name });

test.describe.serial('resident flows (M02-F04, M02-F05)', () => {
  test.setTimeout(240_000);

  const project = (testInfo: TestInfo) =>
    testInfo.project.name.replace(/\D/g, '');
  let tenantId: string;
  let fixture: ResidentFixture;
  let holderEmail: string;
  let memberEmail: string;
  let requesterEmail: string;
  let holder: Page;
  let holderContext: BrowserContext;
  let member: Page;
  let memberContext: BrowserContext;
  const emails: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    const suffix = `${project(testInfo)}.${stamp}`;
    holderEmail = `e2e.holder.${suffix}@domus.local`;
    memberEmail = `e2e.member.${suffix}@domus.local`;
    const tenant = await createTenant(
      `Barrio Hogares ${project(testInfo)}-${stamp}`,
    );
    tenantId = tenant.tenantId;
    fixture = await createHouseholdFixture({
      tenantId,
      unitCode: `Mz ${stamp.slice(-3)} Lote 7`,
      holderEmail,
      holderName: { first: 'Carla', last: 'Hogar' },
    });
    emails.push(
      fixture.adminEmail,
      holderEmail,
      memberEmail,
      `e2e.lucas.${stamp}@domus.local`,
    );
    holderContext = await newContext(browser, testInfo);
    holder = await holderContext.newPage();
    memberContext = await newContext(browser, testInfo);
    member = await memberContext.newPage();
  });

  test.afterAll(async () => {
    await removePetPhotos(fixture.admin, tenantId, fixture.unitId).catch(
      () => undefined,
    );
    await holderContext?.close();
    await memberContext?.close();
    await cleanUpResidents({ tenantIds: [tenantId], emails });
  });

  test('the invited holder sees the privacy notice, accepts and lands in Mi hogar', async () => {
    const testInfo = test.info();
    await openInvitationEmail(holder, await waitForEmailText(holderEmail));
    await expect(holder).toHaveURL(
      /\/invitations\/accept\?token=[a-f0-9]{64}$/,
    );
    await expect(
      holder.getByRole('heading', { name: 'Invitación a un barrio', level: 1 }),
    ).toBeVisible();
    await expect(holder.getByText('Titular', { exact: true })).toBeVisible();

    // The notice is one short line; the full text is behind the info button (spec §12).
    await expect(
      holder.getByText('Tus datos se usan solo para la gestión de tu barrio.'),
    ).toBeVisible();
    await expect(holder.getByText(/Ley 25.326/)).toHaveCount(0);
    await holder
      .getByRole('button', { name: 'Más información sobre la privacidad' })
      .click();
    await expect(holder.getByText(/Ley 25.326/)).toBeVisible();
    await expectNoHorizontalOverflow(holder);
    await shot(holder, 'invitation-accept', testInfo);
    await holder.keyboard.press('Escape');

    await holder.getByLabel('Contraseña (opcional)').fill(PASSWORD);
    await holder.getByLabel('Repetí la contraseña').fill(PASSWORD);
    await holder.getByRole('button', { name: 'Aceptar invitación' }).click();

    await expect(holder).toHaveURL(/\/home$/);
    await expect(
      holder.getByRole('heading', { name: 'Mi hogar', level: 1 }),
    ).toBeVisible();
    await expect(contextSelector(holder)).toContainText('Titular');
    await expect(contextSelector(holder)).toContainText(fixture.unitCode);
    await expect(
      holder.getByRole('link', { name: 'Mi hogar' }).first(),
    ).toHaveAttribute('aria-current', 'page');
    const members = holder.getByRole('list', { name: 'Miembros del hogar' });
    await expect(members).toContainText('Carla Hogar');
    await expect(members.getByText('Vos')).toBeVisible();
    await expect(members.getByText('Titular')).toBeVisible();
    await expectNoHorizontalOverflow(holder);
  });

  test('the holder invites a member by email; the member accepts and sees only the household and what was delegated', async () => {
    const testInfo = test.info();
    await holder.goto('/home');
    await holder.getByRole('button', { name: 'Agregar miembro' }).click();
    const dialog = dialogOf(holder, 'Agregar miembro');
    await expect(dialog).toBeVisible();

    // Validation comes from the server answer, in Spanish, without losing what was typed.
    await dialog.getByLabel('Apellido').fill('Hogar');
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(dialog.getByText('Escribí el nombre.')).toBeVisible();
    await expect(dialog.getByText('Escribí el email.')).toBeVisible();
    await expect(dialog.getByLabel('Apellido')).toHaveValue('Hogar');

    // The explanation of the invitation is behind an info button.
    await dialog
      .getByRole('button', { name: 'Más información sobre agregar miembros' })
      .click();
    await expect(dialog.getByText(/enlace de un solo uso/)).toBeVisible();
    await dialog.getByLabel('Nombre').fill('Diego');
    await dialog.getByLabel('Email').fill(memberEmail);
    await shot(dialog, 'add-member', testInfo);
    await dialog.getByRole('button', { name: 'Enviar invitación' }).click();

    await expect(holder.getByText('Invitación enviada.')).toBeVisible();
    const row = holder
      .getByRole('list', { name: 'Miembros del hogar' })
      .getByRole('listitem')
      .filter({ hasText: 'Diego Hogar' });
    await expect(row.getByText('Invitado')).toBeVisible();
    await expect(row).toContainText(memberEmail);

    // The member follows the email link in their own browser.
    await openInvitationEmail(member, await waitForEmailText(memberEmail));
    await expect(
      member.getByRole('heading', { name: 'Invitación a un barrio', level: 1 }),
    ).toBeVisible();
    await expect(
      member.getByText('Miembro del hogar', { exact: true }),
    ).toBeVisible();
    await expect(
      member.getByText('Tus datos se usan solo para la gestión de tu barrio.'),
    ).toBeVisible();
    await member.getByLabel('Contraseña (opcional)').fill(PASSWORD);
    await member.getByLabel('Repetí la contraseña').fill(PASSWORD);
    await member.getByRole('button', { name: 'Aceptar invitación' }).click();

    await expect(member).toHaveURL(/\/home$/);
    await expect(contextSelector(member)).toContainText('Miembro del hogar');
    // By default a member can only manage access authorizations and passes (D23).
    const delegated = member.getByRole('list', { name: 'Habilitado para vos' });
    await expect(delegated.getByRole('listitem')).toHaveCount(1);
    await expect(delegated).toContainText('Autorizaciones y pases');
    await expect(member.getByText('Finanzas de la unidad')).toHaveCount(0);
    await expect(member.getByText('Reservas de amenities')).toHaveCount(0);
    // The household is visible, read-only: no way to manage anybody or anything.
    await expect(
      member.getByRole('list', { name: 'Miembros del hogar' }),
    ).toContainText('Carla Hogar');
    await expect(
      member.getByRole('button', { name: 'Agregar miembro' }),
    ).toHaveCount(0);
    await expect(member.getByRole('switch')).toHaveCount(0);
    await expect(
      member.getByRole('button', { name: /Quitar|Editar|Invitar/ }),
    ).toHaveCount(0);
    await expect(
      member.getByRole('button', { name: 'Generar código' }),
    ).toHaveCount(0);
    await expect(
      member.getByRole('heading', { name: 'Tus datos' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(member);
    await shot(member, 'member-home', testInfo, 'light', true);
  });

  test('the delegation toggles change what the member sees, and the server refuses everything else', async () => {
    const testInfo = test.info();
    const memberMembership = await membershipIdOf(tenantId, memberEmail);
    await holder.goto('/home');
    const group = holder.getByRole('group', {
      name: 'Permisos de Diego Hogar',
    });
    const finance = group.getByLabel('Ver finanzas de la unidad');
    const amenities = group.getByLabel('Reservar amenities');
    const access = group.getByLabel('Gestionar autorizaciones y pases');
    // Default: only authorizations and passes.
    await expect(finance).not.toBeChecked();
    await expect(amenities).not.toBeChecked();
    await expect(access).toBeChecked();
    await expectNoHorizontalOverflow(holder);
    await shot(holder, 'home-delegations', testInfo, 'light', true);

    // The member's own token: what the database lets them do.
    const token = await accessTokenFromCookies(await memberContext.cookies());
    const asMember = clientWithToken(token);
    const sheet = async () => {
      const { data, error } = await asMember.rpc('unit_sheet', {
        target_tenant_id: tenantId,
        target_unit_id: fixture.unitId,
      });
      expect(error).toBeNull();
      return data as Record<string, unknown>;
    };
    const before = await sheet();
    expect(before.permissions).toEqual(['manage_access_authorizations']);
    expect(before).not.toHaveProperty('balance');
    expect(before.member_permissions).toEqual({});
    expect(before.memberships).toEqual([]);
    expect(before.pending_invitations).toEqual([]);

    await group.getByText('Ver finanzas de la unidad').click();
    await expect(finance).toBeChecked();
    await expect(holder.getByText('Permisos guardados.')).toBeVisible();
    await group.getByText('Reservar amenities').click();
    await expect(amenities).toBeChecked();
    await expect(access).toBeChecked();
    // Each toggle is saved on its own; wait for the database before reloading anything.
    await expect
      .poll(async () => (await sheet()).permissions)
      .toEqual([
        'view_unit_finance',
        'book_amenities',
        'manage_access_authorizations',
      ]);
    await holder.reload();
    await expect(
      holder
        .getByRole('group', { name: 'Permisos de Diego Hogar' })
        .getByLabel('Ver finanzas de la unidad'),
    ).toBeChecked();

    await member.reload();
    const delegated = member.getByRole('list', { name: 'Habilitado para vos' });
    await expect(delegated.getByRole('listitem')).toHaveCount(3);
    await expect(delegated).toContainText('Finanzas de la unidad');
    await expect(delegated).toContainText('Reservas de amenities');
    await expect(delegated).toContainText('Autorizaciones y pases');
    const granted = await sheet();
    expect(granted.permissions).toEqual([
      'view_unit_finance',
      'book_amenities',
      'manage_access_authorizations',
    ]);
    expect(granted).toHaveProperty('balance', null);

    // Direct attempts by the member: delegating, writing the table, changing the household, the unit code.
    const attempt = await asMember.rpc('set_household_permissions', {
      target_tenant_id: tenantId,
      target_unit_id: fixture.unitId,
      target_membership_id: memberMembership,
      permissions: [
        'view_unit_finance',
        'book_amenities',
        'manage_access_authorizations',
      ],
      client_event_id: randomUUID(),
    });
    expect(attempt.error?.code).toBe('42501');
    const direct = await asMember
      .from('membership_household_permission')
      .insert({
        tenant_id: tenantId,
        membership_id: memberMembership,
        membership_household_permission_permission: 'view_unit_finance',
      });
    expect(direct.error).not.toBeNull();
    const vehicle = await asMember.rpc('save_vehicle', {
      target_tenant_id: tenantId,
      target_unit_id: fixture.unitId,
      vehicle_data: { vehicle_plate_code: 'ZZ999ZZ' },
      client_event_id: randomUUID(),
    });
    expect(vehicle.error?.code).toBe('42501');
    const rotation = await asMember.rpc('rotate_unit_join_code', {
      target_tenant_id: tenantId,
      target_unit_id: fixture.unitId,
    });
    expect(rotation.error?.code).toBe('42501');

    // Taking one away removes it for the member again.
    const again = holder.getByRole('group', {
      name: 'Permisos de Diego Hogar',
    });
    await again.getByText('Ver finanzas de la unidad').click();
    await expect(
      again.getByLabel('Ver finanzas de la unidad'),
    ).not.toBeChecked();
    await expect
      .poll(async () => (await sheet()).permissions)
      .toEqual(['book_amenities', 'manage_access_authorizations']);
    await member.reload();
    await expect(delegated.getByRole('listitem')).toHaveCount(2);
    await expect(member.getByText('Finanzas de la unidad')).toHaveCount(0);
    expect(await sheet()).not.toHaveProperty('balance');
    // Back to the default so the rest of the flow starts from it.
    await again.getByText('Reservar amenities').click();
    await expect(again.getByLabel('Reservar amenities')).not.toBeChecked();
    await expect
      .poll(async () => (await sheet()).permissions)
      .toEqual(['manage_access_authorizations']);
  });

  test('the holder adds, edits and removes vehicles; the plate format help is behind an info button', async () => {
    const testInfo = test.info();
    await holder.goto('/home');
    await holder.getByRole('button', { name: 'Agregar vehículo' }).click();
    const dialog = dialogOf(holder, 'Agregar vehículo');
    await dialog
      .getByRole('button', {
        name: 'Más información sobre el formato de la patente',
      })
      .click();
    await expect(dialog.getByText(/AB 123 CD \(desde 2016\)/)).toBeVisible();
    await holder.keyboard.press('Escape');

    await dialog.getByLabel('Patente', { exact: true }).fill('!');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText(/Revisá la patente/)).toBeVisible();
    await dialog.getByLabel('Patente', { exact: true }).fill('ab 123 cd');
    await dialog.getByLabel('Marca').fill('Fiat');
    await shot(dialog, 'add-vehicle', testInfo);
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(holder.getByText('Cambios guardados.')).toBeVisible();
    const list = holder.getByRole('list', { name: 'Vehículos del hogar' });
    await expect(list).toContainText('AB 123 CD');
    await expect(list).toContainText('Fiat');

    await holder
      .getByRole('button', { name: 'Editar el vehículo AB 123 CD' })
      .click();
    const edit = dialogOf(holder, 'Editar vehículo');
    await expect(edit.getByLabel('Patente', { exact: true })).toHaveValue(
      'AB 123 CD',
    );
    await edit.getByLabel('Modelo').fill('Cronos');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(list).toContainText('Fiat · Cronos');

    await holder.reload();
    await expect(list).toContainText('Fiat · Cronos');
    await holder
      .getByRole('button', { name: 'Eliminar el vehículo AB 123 CD' })
      .click();
    const confirm = dialogOf(holder, 'Eliminar el vehículo AB 123 CD');
    await expect(confirm).toContainText('Se quita del registro de la unidad.');
    await confirm.getByRole('button', { name: 'Eliminar vehículo' }).click();
    await expect(holder.getByText('Sin vehículos')).toBeVisible();
    await holder.reload();
    await expect(holder.getByText('Sin vehículos')).toBeVisible();
    // Kept for the screenshots of the final state.
    await holder.getByRole('button', { name: 'Agregar vehículo' }).click();
    const again = dialogOf(holder, 'Agregar vehículo');
    await again.getByLabel('Patente', { exact: true }).fill('AB123CD');
    await again.getByLabel('Marca').fill('Fiat');
    await again.getByLabel('Modelo').fill('Cronos');
    await again.getByLabel('Color').fill('Gris');
    await again.getByRole('button', { name: 'Guardar' }).click();
    await expect(list).toContainText('AB 123 CD');
  });

  test('the holder adds a pet with a photo, then removes it', async () => {
    const testInfo = test.info();
    await holder.goto('/home');
    await holder.getByRole('button', { name: 'Agregar mascota' }).click();
    const dialog = dialogOf(holder, 'Agregar mascota');
    await expect(dialog.getByText('Sin foto')).toBeVisible();
    await dialog.getByLabel('Nombre').fill('Luna');
    await dialog.getByLabel('Especie').fill('Perro');
    await dialog.getByLabel('Raza').fill('Mestiza');
    await dialog
      .getByRole('button', { name: 'Más información sobre la foto' })
      .click();
    await expect(dialog.getByText(/hasta 2 MB/)).toBeVisible();
    await holder.keyboard.press('Escape');
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: 'luna.png', mimeType: 'image/png', buffer: PNG });
    await expect(dialog.getByText('luna.png')).toBeVisible();
    await shot(dialog, 'add-pet', testInfo);
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(holder.getByText('Cambios guardados.')).toBeVisible();
    const list = holder.getByRole('list', { name: 'Mascotas del hogar' });
    await expect(list).toContainText('Luna');
    await expect(list).toContainText('Perro · Mestiza');
    const photo = list.getByAltText('Foto de Luna');
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // The member sees the pet and its photo, and can't change anything.
    await member.reload();
    const memberList = member.getByRole('list', { name: 'Mascotas del hogar' });
    await expect(memberList).toContainText('Luna');
    await expect(memberList.getByRole('button')).toHaveCount(0);

    await shot(holder, 'home', testInfo, 'light', true);
    await holder.getByRole('button', { name: 'Eliminar a Luna' }).click();
    await dialogOf(holder, 'Eliminar a Luna')
      .getByRole('button', { name: 'Eliminar mascota' })
      .click();
    await expect(holder.getByText('Sin mascotas')).toBeVisible();
    await holder.reload();
    await expect(holder.getByText('Sin mascotas')).toBeVisible();
  });

  test('a signed-in person joins with the unit code; the holder approves; the invitation email makes them a member', async ({
    browser,
  }, testInfo) => {
    // The holder generates the code (it is shown once; the previous one would stop working).
    await holder.goto('/home');
    await holder.getByRole('button', { name: 'Generar código' }).click();
    const confirm = dialogOf(holder, 'Generar un código nuevo');
    await expect(confirm).toContainText(
      'El código anterior deja de funcionar.',
    );
    await confirm.getByRole('button', { name: 'Generar código' }).click();
    const code = (await holder.getByTestId('unit-code').innerText()).trim();
    expect(code).toMatch(
      /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
    );
    await expect(
      holder.getByRole('button', { name: 'Generar código nuevo' }),
    ).toBeVisible();

    // A person with an account and no barrio at all.
    const requester = await createDisposableUser();
    requesterEmail = requester.email;
    emails.push(requesterEmail);
    const context = await newContext(browser, testInfo);
    const page = await context.newPage();
    try {
      await signIn(page, requesterEmail, requester.password);
      await expect(
        page.getByText('Todavía no tenés un barrio asignado'),
      ).toBeVisible();
      await page
        .getByRole('link', { name: 'Tengo un código de unidad' })
        .click();
      await expect(page).toHaveURL(/\/join$/);
      await expect(
        page.getByRole('heading', { name: 'Unirme a una unidad', level: 1 }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await shot(page, 'join', testInfo);

      // A wrong code and a made-up one get the very same answer: nothing reveals which codes exist.
      const answer =
        'No pudimos usar ese código. Revisalo y volvé a intentar en unos minutos.';
      const fill = async (value: string) => {
        await page.getByLabel('Código de unidad').fill(value);
        await page.getByLabel('Nombre', { exact: true }).fill('Ana');
        await page.getByLabel('Apellido').fill('Solicitante');
        await page.getByRole('button', { name: 'Enviar solicitud' }).click();
      };
      await fill('ABC');
      await expect(page.getByText(answer)).toBeVisible();
      const errors = page.locator('p[id$="-error"]');
      const malformed = await errors.allInnerTexts();
      await fill('ZZZZ-ZZZZ-ZZZZ');
      await expect(page.getByText(answer)).toBeVisible();
      expect(await errors.allInnerTexts()).toEqual(malformed);
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
        'Ana',
      );

      // The real code, pasted in lower case and with spaces, is accepted.
      await page
        .getByLabel('Código de unidad')
        .fill(code.toLowerCase().replaceAll('-', ' '));
      await expect(page.getByLabel('Código de unidad')).toHaveValue(code);
      await page.getByRole('button', { name: 'Enviar solicitud' }).click();
      await expect(
        page.getByRole('heading', { name: 'Solicitud enviada' }),
      ).toBeVisible();
      await expect(page.getByText('Pendiente de aprobación')).toBeVisible();
      await shot(page, 'join-sent', testInfo);

      // Their requests: pending, with the barrio and unit; it can be cancelled.
      await page.reload();
      const requests = page.getByRole('list', {
        name: 'Tus solicitudes de ingreso',
      });
      await expect(requests).toContainText(fixture.unitCode);
      await expect(requests).toContainText('Pendiente');
      await shot(page, 'join-requests', testInfo);
      await page
        .getByRole('button', { name: /^Cancelar la solicitud a / })
        .click();
      const cancel = dialogOf(page, 'Cancelar la solicitud');
      await cancel.getByRole('button', { name: 'Cancelar solicitud' }).click();
      await expect(requests).toContainText('Cancelada');
      await holder.reload();
      await expect(
        holder.getByRole('heading', { name: 'Solicitudes de ingreso' }),
      ).toHaveCount(0);

      // A new request after cancelling; the holder sees it and approves it.
      await page.goto('/join');
      await fill(code);
      await expect(
        page.getByRole('heading', { name: 'Solicitud enviada' }),
      ).toBeVisible();
      await holder.reload();
      const pending = holder.getByRole('list', {
        name: 'Solicitudes de ingreso pendientes',
      });
      await expect(pending).toContainText('Ana Solicitante');
      await expect(pending).toContainText(requesterEmail);
      await expectNoHorizontalOverflow(holder);
      await shot(holder, 'home-requests', testInfo, 'light', true);
      await holder
        .getByRole('button', {
          name: 'Aprobar la solicitud de Ana Solicitante',
        })
        .click();
      await expect(
        holder.getByText(
          'Solicitud aprobada. Enviamos la invitación por email.',
        ),
      ).toBeVisible();
      const approved = holder
        .getByRole('list', { name: 'Miembros del hogar' })
        .getByRole('listitem')
        .filter({ hasText: 'Ana Solicitante' });
      await expect(approved.getByText('Invitado')).toBeVisible();

      // Approving did not give access: the requester still has no barrio, only the approved request.
      await page.goto('/join');
      await expect(
        page.getByRole('list', { name: 'Tus solicitudes de ingreso' }),
      ).toContainText('Aprobada');
      await page.goto('/home');
      await expect(
        page.getByText('Todavía no tenés un barrio asignado'),
      ).toBeVisible();
    } finally {
      await context.close();
    }

    // The invitation email arrives; accepting it makes the requester a member of the household.
    const invited = await newContext(browser, testInfo);
    const invitedPage = await invited.newPage();
    try {
      await openInvitationEmail(
        invitedPage,
        await waitForEmailText(requesterEmail),
      );
      await expect(
        invitedPage.getByText('Miembro del hogar', { exact: true }),
      ).toBeVisible();
      await invitedPage
        .getByRole('button', { name: 'Aceptar invitación' })
        .click();
      await expect(invitedPage).toHaveURL(/\/home$/);
      await expect(contextSelector(invitedPage)).toContainText(
        'Miembro del hogar',
      );
      await expect(contextSelector(invitedPage)).toContainText(
        fixture.unitCode,
      );
      await expect(
        invitedPage.getByRole('list', { name: 'Habilitado para vos' }),
      ).toContainText('Autorizaciones y pases');
    } finally {
      await invited.close();
    }
    await holder.reload();
    await expect(
      holder
        .getByRole('list', { name: 'Miembros del hogar' })
        .getByRole('listitem')
        .filter({ hasText: 'Ana Solicitante' })
        .getByText('Con cuenta'),
    ).toBeVisible();
  });

  test('the holder manages people without an account (minor, revoked invitation); a member with an account is out of the holder reach', async () => {
    const members = holder.getByRole('list', { name: 'Miembros del hogar' });
    const rowOf = (name: string) =>
      members.getByRole('listitem').filter({ hasText: name });
    await holder.goto('/home');

    // A person with an account can't be edited or removed by the holder (T19): not offered, and refused by the database.
    const diego = rowOf('Diego Hogar');
    await expect(diego.getByText('Con cuenta')).toBeVisible();
    await expect(
      diego.getByRole('button', { name: /Editar|Quitar/ }),
    ).toHaveCount(0);
    const asHolder = clientWithToken(
      await accessTokenFromCookies(await holderContext.cookies()),
    );
    const ended = await asHolder.rpc('save_resident', {
      target_tenant_id: tenantId,
      target_unit_id: fixture.unitId,
      person_data: {
        person_id: await personIdByEmail(tenantId, memberEmail),
        person_first_name: 'Diego',
        person_last_name: 'Hogar',
      },
      resident_data: {
        unit_resident_relationship: 'family',
        unit_resident_valid_to_at: new Date().toISOString(),
      },
      client_event_id: randomUUID(),
    });
    expect(ended.error?.code).toBe('42501');

    // A minor is registered without account: no invitation, no permissions; it can be edited and removed.
    await holder.getByRole('button', { name: 'Agregar miembro' }).click();
    const add = dialogOf(holder, 'Agregar miembro');
    await add.getByLabel('Nombre').fill('Mateo');
    await add.getByLabel('Apellido').fill('Hogar');
    await add.getByText('Es menor de edad').click();
    await expect(add.getByLabel('Email')).toHaveCount(0);
    await add.getByRole('button', { name: 'Guardar' }).click();
    await expect(holder.getByText('Menor agregado al hogar.')).toBeVisible();
    const mateo = rowOf('Mateo Hogar');
    await expect(mateo.getByText('Menor', { exact: true })).toBeVisible();
    await expect(mateo.getByRole('button', { name: /Invitar/ })).toHaveCount(0);
    await expect(mateo.getByRole('group')).toHaveCount(0);

    await mateo.getByRole('button', { name: 'Editar a Mateo Hogar' }).click();
    const edit = dialogOf(holder, 'Editar miembro');
    await edit.getByLabel('Relación').selectOption('tenant');
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(mateo).toContainText('Inquilino');
    await mateo
      .getByRole('button', { name: 'Quitar a Mateo Hogar del hogar' })
      .click();
    const confirm = dialogOf(holder, 'Quitar a Mateo Hogar del hogar');
    await expect(confirm).toContainText('Pierde el acceso a la unidad');
    await confirm.getByRole('button', { name: 'Quitar del hogar' }).click();
    await expect(
      holder.getByText('Quitaste a la persona del hogar.'),
    ).toBeVisible();
    await expect(members).not.toContainText('Mateo Hogar');

    // An invitation that is revoked leaves a resident without account who can be invited again or removed.
    await holder.getByRole('button', { name: 'Agregar miembro' }).click();
    const invite = dialogOf(holder, 'Agregar miembro');
    await invite.getByLabel('Nombre').fill('Lucas');
    await invite.getByLabel('Apellido').fill('Hogar');
    await invite.getByLabel('Email').fill(`e2e.lucas.${stamp}@domus.local`);
    await invite.getByRole('button', { name: 'Enviar invitación' }).click();
    const lucas = rowOf('Lucas Hogar');
    await expect(lucas.getByText('Invitado')).toBeVisible();
    await expect(
      lucas.getByRole('button', { name: /Editar|Quitar/ }),
    ).toHaveCount(0);
    await lucas
      .getByRole('button', { name: 'Revocar la invitación de Lucas Hogar' })
      .click();
    await expect(holder.getByText('Invitación revocada.')).toBeVisible();
    await expect(lucas.getByText('Sin cuenta')).toBeVisible();
    await expect(
      lucas.getByRole('button', { name: 'Invitar a Lucas Hogar' }),
    ).toBeVisible();
    await lucas
      .getByRole('button', { name: 'Quitar a Lucas Hogar del hogar' })
      .click();
    await dialogOf(holder, 'Quitar a Lucas Hogar del hogar')
      .getByRole('button', { name: 'Quitar del hogar' })
      .click();
    await expect(members).not.toContainText('Lucas Hogar');
  });

  test('Mi hogar in dark mode and the bottom tab bar on mobile', async ({
    browser,
  }, testInfo) => {
    test.skip(!SHOTS && !isMobile(testInfo), 'the tab bar is only on mobile');
    const dark = await newContext(browser, testInfo, 'dark');
    await dark.addInitScript(() => localStorage.setItem('domus.theme', 'dark'));
    const page = await dark.newPage();
    try {
      await loginWithPassword(page, holderEmail, PASSWORD);
      await page.goto('/home');
      await expect(
        page.getByRole('heading', { name: 'Mi hogar', level: 1 }),
      ).toBeVisible();
      if (isMobile(testInfo)) {
        const tabs = page.getByRole('navigation', {
          name: 'Navegación principal',
        });
        await expect(tabs.getByRole('link')).toHaveCount(5);
        await expect(
          tabs.getByRole('link', { name: 'Mi hogar' }),
        ).toHaveAttribute('aria-current', 'page');
        await expectTouchTargets(page);
      }
      await shot(page, 'home', testInfo, 'dark', true);
      await page.goto('/');
      await expect(
        page.getByRole('link', { name: 'Unirme con un código' }),
      ).toBeVisible();
    } finally {
      await dark.close();
    }
  });
});
