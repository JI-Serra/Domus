import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import {
  addMembership,
  cleanUp,
  grantPermission,
  withDatabase,
} from './support/database';
import {
  expectNoHorizontalOverflow,
  loginWithPassword,
  newContext,
  signIn,
} from './support/flows';
import { extractAuthLink, waitForEmailTextSince } from './support/mailpit';
import {
  createRegistryAdmin,
  openRegistrySection,
  uniqueSuffix,
} from './support/registry';
import type { RegistryAdmin } from './support/registry';
import { createDisposableUser, signedInClient } from './support/supabase';

test.describe.serial('guards, gates and devices (M02-F06/F07)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let suffix: string;
  let page: Page;
  const emails: string[] = [];
  const contexts: BrowserContext[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    suffix = uniqueSuffix(testInfo);
    admin = await createRegistryAdmin(`Barrio Guardias ${suffix}`);
    emails.push(admin.email);
    const context = await browser.newContext({
      ...testInfo.project.use,
      locale: 'es-AR',
    });
    contexts.push(context);
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    for (const context of contexts) await context.close();
    await cleanUp({ tenantIds: [admin.tenantId], emails });
  });

  test('administrators only get the Padrón destinations their permissions allow', async ({
    browser,
  }, testInfo) => {
    const registryOnly = await createDisposableUser();
    const guardsOnly = await createDisposableUser();
    emails.push(registryOnly.email, guardsOnly.email);
    await addMembership(registryOnly.userId, admin.tenantId, 'tenant_admin');
    await grantPermission(registryOnly.userId, admin.tenantId, 'registry');
    await addMembership(guardsOnly.userId, admin.tenantId, 'tenant_admin');
    await grantPermission(guardsOnly.userId, admin.tenantId, 'guards');

    const registryContext = await newContext(browser, testInfo);
    contexts.push(registryContext);
    const registryPage = await registryContext.newPage();
    await loginWithPassword(registryPage, registryOnly.email);
    await registryPage.goto('/registry');
    await expect(registryPage).toHaveURL(/\/registry\/units$/);
    const gated = await registryPage.goto('/registry/gates');
    expect(gated?.status()).toBe(404);
    // The guards page opens, but the gate switches are not there to change.
    await registryPage.goto('/registry/guards');
    await expect(registryPage.getByRole('heading', { level: 1 })).toHaveText(
      'Guardias',
    );

    const guardsContext = await newContext(browser, testInfo);
    contexts.push(guardsContext);
    const guardsPage = await guardsContext.newPage();
    await loginWithPassword(guardsPage, guardsOnly.email);
    await guardsPage.goto('/registry');
    await expect(guardsPage).toHaveURL(/\/registry\/gates$/);
    expect((await guardsPage.goto('/registry/units'))?.status()).toBe(404);
    expect((await guardsPage.goto('/registry/import'))?.status()).toBe(404);
    // And the global search belongs to `registry` only.
    await guardsPage.goto('/registry/gates');
    await expect(
      guardsPage.getByRole('combobox', { name: 'Buscar en el padrón' }),
    ).toHaveCount(0);
    expect(
      (await guardsPage.request.get('/api/registry/search?q=a')).status(),
    ).toBe(404);
  });

  test('creates and edits a gate', async () => {
    await page.goto('/registry/units');
    await openRegistrySection(page, 'Puestos');
    await expect(page.getByText('Todavía no hay puestos.')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo puesto' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nuevo puesto' });
    await sheet.getByRole('button', { name: 'Crear puesto' }).click();
    await expect(
      sheet.getByText('Escribí el nombre del puesto.'),
    ).toBeVisible();
    await sheet.getByLabel('Nombre', { exact: true }).fill('Acceso Norte');
    await sheet.getByLabel('Tipo', { exact: true }).selectOption('pedestrian');
    await sheet.getByRole('button', { name: 'Crear puesto' }).click();
    const gates = page.getByRole('list', { name: 'Puestos del barrio' });
    await expect(gates).toContainText('Acceso Norte');
    await expect(gates).toContainText('Peatonal');
    await expect(gates).toContainText('Activo');

    await page
      .getByRole('button', { name: 'Editar el puesto Acceso Norte' })
      .click();
    const edit = page.getByRole('dialog', { name: 'Editar puesto' });
    await edit.getByLabel('Nombre', { exact: true }).fill('Acceso Norte 2');
    await edit.getByLabel('Tipo', { exact: true }).selectOption('vehicular');
    await edit.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(gates).toContainText('Acceso Norte 2');
    await expect(gates).toContainText('Vehicular');
    await expectNoHorizontalOverflow(page);
  });

  test('invites a guard by email, assigns a gate and deactivates the guard', async () => {
    const since = new Date(Date.now() - 2000);
    const inviteeEmail = `e2e.guard.${suffix}@domus.local`;
    emails.push(inviteeEmail);

    await openRegistrySection(page, 'Guardias');
    const form = page.getByRole('button', { name: 'Enviar invitación' });
    await form.click();
    await expect(page.getByText('Escribí el nombre.')).toBeVisible();
    await page.getByLabel('Nombre', { exact: true }).fill('Gael');
    await page.getByLabel('Apellido', { exact: true }).fill('Guardián');
    await page.getByLabel('Email', { exact: true }).fill(inviteeEmail);
    await form.click();
    await expect(page.getByText('Invitación enviada.')).toBeVisible();
    const pending = page.getByRole('region', {
      name: 'Invitaciones pendientes',
    });
    await expect(pending).toContainText(inviteeEmail);
    // The email carries the real link into the barrio as a guard.
    expect(
      extractAuthLink(await waitForEmailTextSince(inviteeEmail, since)),
    ).toContain('/auth/v1/verify');

    // A guard of the barrio (already accepted) to work with.
    const guard = await createDisposableUser();
    emails.push(guard.email);
    await addMembership(guard.userId, admin.tenantId, 'guard', {
      first: 'Gabi',
      last: 'Guardia',
    });
    await page.reload();
    const guards = page.getByRole('list', { name: 'Guardias' });
    await expect(guards).toContainText('Gabi Guardia');
    const gateSwitch = guards.getByRole('switch', { name: 'Acceso Norte 2' });
    await expect(gateSwitch).not.toBeChecked();
    await gateSwitch.click({ force: true });
    await expect(page.getByText('Puestos actualizados.')).toBeVisible();
    await page.reload();
    await expect(
      page
        .getByRole('list', { name: 'Guardias' })
        .getByRole('switch', { name: 'Acceso Norte 2' }),
    ).toBeChecked();

    // Revoking the invitation removes it from the list.
    await page
      .getByRole('button', { name: `Revocar la invitación a ${inviteeEmail}` })
      .click();
    await expect(
      page.getByRole('region', { name: 'Invitaciones pendientes' }),
    ).toHaveCount(0);

    // Deactivate, with the effect spelled out.
    await page
      .getByRole('button', { name: 'Desactivar a Gabi Guardia' })
      .click();
    const dialog = page.getByRole('dialog', {
      name: '¿Desactivar al guardia?',
    });
    await expect(dialog).toContainText('deja de poder ingresar');
    await dialog
      .getByRole('button', { name: 'Desactivar', exact: true })
      .click();
    await expect(page.getByText('Guardia desactivado.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Guardias' })).toContainText(
      'Inactivo',
    );
    await expectNoHorizontalOverflow(page);
  });

  test('pairs a tablet with a ten-minute code, lists it with its last sync, and revokes it', async ({
    browser,
  }, testInfo) => {
    const guard = await createDisposableUser();
    emails.push(guard.email);
    await addMembership(guard.userId, admin.tenantId, 'guard', {
      first: 'Pablo',
      last: 'Puesto',
    });

    await openRegistrySection(page, 'Puestos');
    await page
      .getByRole('button', {
        name: 'Vincular una tablet al puesto Acceso Norte 2',
      })
      .click();
    const sheet = page.getByRole('dialog', { name: /Vincular una tablet a/ });
    const secret = sheet.getByTestId('one-time-secret');
    await expect(secret).toHaveText(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/);
    const code = (await secret.textContent()) ?? '';
    const countdown = sheet.getByTestId('countdown');
    await expect(countdown).toHaveText(/^(9:5\d|10:00)$/);
    await expect(
      sheet.getByRole('button', { name: 'Copiar código' }),
    ).toBeVisible();
    await sheet
      .getByRole('button', { name: 'Más información sobre el código' })
      .click();
    await expect(sheet).toContainText('/devices/pair');
    await expectNoHorizontalOverflow(page);

    // On the tablet: the guard signs in and types the code.
    const tablet = await newContext(browser, testInfo);
    contexts.push(tablet);
    const tabletPage = await tablet.newPage();
    await signIn(tabletPage, guard.email);
    await tabletPage.goto('/devices/pair');
    await tabletPage.getByLabel('Nombre del dispositivo').fill('Tablet e2e');

    // A wrong code gets the one uniform answer.
    await tabletPage.getByLabel('Código de vinculación').fill('0'.repeat(32));
    await tabletPage
      .getByRole('button', { name: 'Vincular', exact: true })
      .click();
    await expect(
      tabletPage.getByText('El código no es válido, venció o ya se usó.'),
    ).toBeVisible();

    await tabletPage.getByLabel('Código de vinculación').fill(code);
    await tabletPage
      .getByRole('button', { name: 'Vincular', exact: true })
      .click();
    await expect(tabletPage.getByTestId('pair-success')).toContainText(
      'Tablet e2e',
    );

    // The credential is kept where scripts cannot read it, and works for sync.
    const cookie = (await tablet.cookies()).find(
      (item) => item.name === 'domus-device',
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    expect(await tabletPage.evaluate(() => document.cookie)).not.toContain(
      'domus-device',
    );
    const credential = JSON.parse(
      Buffer.from(cookie?.value ?? '', 'base64url').toString('utf8'),
    ) as { tenant_id: string; device_id: string; device_token: string };
    const guardClient = await signedInClient(guard.email);
    const sync = () =>
      guardClient.rpc('sync_device', {
        target_tenant_id: credential.tenant_id,
        target_device_id: credential.device_id,
        device_token: credential.device_token,
      });
    expect((await sync()).data).toMatchObject({ status: 'active' });

    // The same code never works twice.
    await tabletPage.goto('/devices/pair');
    await tabletPage.getByLabel('Nombre del dispositivo').fill('Otra tablet');
    await tabletPage.getByLabel('Código de vinculación').fill(code);
    await tabletPage
      .getByRole('button', { name: 'Vincular', exact: true })
      .click();
    await expect(
      tabletPage.getByText('El código no es válido, venció o ya se usó.'),
    ).toBeVisible();

    // The administrator sees the device with its last sync, and revokes it.
    await page.reload();
    const devices = page.getByRole('table', {
      name: 'Dispositivos vinculados',
    });
    const row = devices.getByRole('row', { name: /Tablet e2e/ });
    await expect(row).toContainText('Activo');
    await expect(row).toContainText('Acceso Norte 2');
    await expect(row).not.toContainText('Nunca');
    await page
      .getByRole('button', { name: 'Revocar el dispositivo Tablet e2e' })
      .click();
    const dialog = page.getByRole('dialog', {
      name: '¿Revocar el dispositivo?',
    });
    await expect(dialog).toContainText('deja de sincronizar');
    await dialog.getByRole('button', { name: 'Revocar dispositivo' }).click();
    await expect(page.getByText('Dispositivo revocado.')).toBeVisible();
    await expect(row).toContainText('Revocado');
    expect((await sync()).data).toMatchObject({ status: 'unavailable' });

    const { rows } = await withDatabase((db) =>
      db.query<{ device_status: string }>(
        'select device_status from public.device where device_id = $1',
        [credential.device_id],
      ),
    );
    expect(rows[0]?.device_status).toBe('revoked');
  });

  test('users who are neither guards nor guard managers cannot open the pairing page', async ({
    browser,
  }, testInfo) => {
    const registryOnly = await createDisposableUser();
    emails.push(registryOnly.email);
    await addMembership(registryOnly.userId, admin.tenantId, 'tenant_admin');
    await grantPermission(registryOnly.userId, admin.tenantId, 'registry');
    const context = await newContext(browser, testInfo);
    contexts.push(context);
    const other = await context.newPage();
    await loginWithPassword(other, registryOnly.email);
    expect((await other.goto('/devices/pair'))?.status()).toBe(404);
  });
});
