import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { ACCOUNTS, TENANT_IDS } from './support/accounts';
import {
  addMembership,
  auditEventsForSession,
  cleanUp,
  createTenant,
  makePlatformAdmin,
  tenantIdByName,
  userIdByEmail,
} from './support/database';
import {
  contextSelector,
  enrollTotp,
  expectNoHorizontalOverflow,
  PNG,
  loginWithPassword,
  newContext,
  signIn,
} from './support/flows';
import { extractAuthLink, waitForEmailText } from './support/mailpit';
import {
  accessTokenFromCookies,
  clientWithToken,
  createDisposableUser,
  jwtClaims,
} from './support/supabase';

const stamp = `${Date.now()}`.slice(-9);
const ADMIN_FIRST = 'Marta';
const ADMIN_LAST = 'Soporte';

const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'mobile-360';

test.describe.serial('platform backoffice (M01-F01..F04)', () => {
  test.setTimeout(120_000);

  const project = (testInfo: TestInfo) =>
    testInfo.project.name.replace(/\D/g, '');
  let tenantName: string;
  let tenantId: string;
  let adminEmail: string;
  let inviteeEmail: string;
  let admin: Page;
  let adminContext: BrowserContext;
  let invitee: Page;
  let inviteeContext: BrowserContext;
  let inviteLink: string;
  let invitationToken: string;
  let supportToken: string;
  let supportSessionId: string;
  const extraEmails: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    tenantName = `Barrio Backoffice ${project(testInfo)}-${stamp}`;
    inviteeEmail = `e2e.admin.${project(testInfo)}.${stamp}@domus.local`;
    const platformAdmin = await createDisposableUser();
    adminEmail = platformAdmin.email;
    await makePlatformAdmin(platformAdmin.userId);

    adminContext = await newContext(browser, testInfo);
    admin = await adminContext.newPage();
    await signIn(admin, platformAdmin.email, platformAdmin.password);
    await admin.goto('/platform/tenants');
    await enrollTotp(admin);
    await expect(admin).toHaveURL(/\/platform\/tenants$/);
  });

  test.afterAll(async () => {
    // Remove the logo object through the Storage API (as the platform admin), then everything else with SQL.
    try {
      if (tenantId && admin) {
        const token = await accessTokenFromCookies(
          await adminContext.cookies(),
        );
        const storage = clientWithToken(token).storage.from('tenant-logo');
        const { data } = await storage.list(tenantId);
        if (data?.length)
          await storage.remove(data.map((file) => `${tenantId}/${file.name}`));
      }
    } finally {
      await adminContext?.close();
      await inviteeContext?.close();
      await cleanUp({
        tenantIds: tenantId ? [tenantId] : [],
        emails: [adminEmail, inviteeEmail, ...extraEmails],
      });
    }
  });

  test('creates a barrio with its logo and shows it in the list', async () => {
    const testInfo = test.info();
    await admin.goto('/platform/tenants');
    await expect(
      admin.getByRole('heading', { name: 'Barrios', level: 1 }),
    ).toBeVisible();
    await admin.getByRole('link', { name: 'Crear barrio' }).click();
    await expect(admin).toHaveURL(/\/platform\/tenants\/new$/);

    // Validation first: the form tells what is wrong, in Spanish, per field.
    await admin.getByRole('button', { name: 'Crear barrio' }).click();
    await expect(admin.getByText('Escribí el nombre.')).toBeVisible();
    await expect(admin.getByText('Escribí un identificador.')).toBeVisible();

    await admin.getByLabel('Nombre', { exact: true }).fill(tenantName);
    // The identifier is suggested from the name.
    await expect(
      admin.getByLabel('Identificador', { exact: true }),
    ).toHaveValue(
      tenantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+$/g, ''),
    );
    await admin.getByLabel('Dirección').fill('Calle Ficticia 123, Yerba Buena');
    await admin.getByLabel('Logo', { exact: true }).setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expectNoHorizontalOverflow(admin);
    await admin.getByRole('button', { name: 'Crear barrio' }).click();

    await expect(admin).toHaveURL(/\/platform\/tenants\/[0-9a-f-]{36}$/);
    tenantId = await tenantIdByName(tenantName);
    await expect(
      admin.getByRole('heading', { name: new RegExp(tenantName), level: 1 }),
    ).toContainText('Piloto');
    // The private logo is served through a signed URL and renders.
    const logo = admin.getByRole('img', { name: `Logo de ${tenantName}` });
    await expect(logo).toBeVisible();
    await expect
      .poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expectNoHorizontalOverflow(admin);

    // Searchable in the list.
    await admin.goto('/platform/tenants');
    await admin
      .getByRole('searchbox', { name: 'Buscar barrio' })
      .fill(`backoffice ${project(testInfo)}-${stamp}`);
    await admin.getByRole('button', { name: 'Buscar' }).click();
    await expect(admin).toHaveURL(/q=/);
    await expect(
      admin.getByRole('link', { name: `Abrir ${tenantName}` }),
    ).toBeVisible();
    await expect(
      admin.getByRole('table', { name: 'Lista de barrios' }),
    ).toContainText('Piloto');
    await admin
      .getByRole('searchbox', { name: 'Buscar barrio' })
      .fill('no existe ningún barrio así');
    await admin.getByRole('button', { name: 'Buscar' }).click();
    await expect(
      admin.getByText('No encontramos barrios con esa búsqueda'),
    ).toBeVisible();
  });

  test('invites the first admin; the email link leads to a confirmation that names the barrio and role, then into the barrio', async ({
    browser,
  }, testInfo) => {
    await admin.goto(`/platform/tenants/${tenantId}`);
    const form = admin.locator('form').filter({
      has: admin.getByRole('heading', { name: 'Primer administrador' }),
    });

    // Validation.
    await form.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(admin.getByText('Escribí el apellido.')).toBeVisible();
    await expect(admin.getByText('Escribí el email.')).toBeVisible();

    await form.getByLabel('Nombre').fill(ADMIN_FIRST);
    await form.getByLabel('Apellido').fill(ADMIN_LAST);
    await form.getByLabel('Email').fill(inviteeEmail);
    await form.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(admin.getByText('Invitación enviada.')).toBeVisible();
    const list = admin.getByRole('list', { name: 'Invitaciones del barrio' });
    await expect(list).toContainText(inviteeEmail);
    await expect(list).toContainText('Pendiente');
    await expectNoHorizontalOverflow(admin);

    // The invitee follows the email link in their own browser.
    inviteLink = extractAuthLink(await waitForEmailText(inviteeEmail));
    inviteeContext = await newContext(browser, testInfo);
    invitee = await inviteeContext.newPage();
    await invitee.goto(inviteLink);
    await expect(invitee).toHaveURL(
      /\/invitations\/accept\?token=[a-f0-9]{64}$/,
    );
    invitationToken = new URL(invitee.url()).searchParams.get('token') ?? '';
    await expect(
      invitee.getByRole('heading', {
        name: 'Invitación a un barrio',
        level: 1,
      }),
    ).toBeVisible();
    // Tenant name and role are shown before accepting.
    const summary = invitee.getByRole('term').filter({ hasText: 'Barrio' });
    await expect(summary).toBeVisible();
    await expect(invitee.getByText(tenantName, { exact: true })).toBeVisible();
    await expect(
      invitee.getByText('Administrador', { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(invitee);

    // Password rules apply when one is set; it is optional.
    await invitee.getByLabel('Contraseña (opcional)').fill('corta');
    await invitee.getByLabel('Repetí la contraseña').fill('corta');
    await invitee.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(
      invitee.getByText('La contraseña tiene que tener al menos 8 caracteres.'),
    ).toBeVisible();
    await invitee.getByLabel('Contraseña (opcional)').fill('ClaveSegura123!');
    await invitee.getByLabel('Repetí la contraseña').fill('ClaveSegura123!');
    await invitee.getByRole('button', { name: 'Aceptar invitación' }).click();

    // Lands in the new context: the barrio, as administrator.
    await expect(invitee).toHaveURL(/\/$/);
    await expect(contextSelector(invitee)).toContainText(tenantName);
    await expect(contextSelector(invitee)).toContainText('Administrador');

    // The platform sees the invitation as accepted.
    await admin.reload();
    await expect(
      admin.getByRole('list', { name: 'Invitaciones del barrio' }),
    ).toContainText('Aceptada');
    await expect(
      admin.getByRole('button', {
        name: `Revocar la invitación de ${inviteeEmail}`,
      }),
    ).toHaveCount(0);
  });

  test('a used link, another account and a forged token all get the same answer', async ({
    browser,
  }, testInfo) => {
    const unavailable = (page: Page) =>
      page.getByText('Esta invitación no está disponible', { exact: true });

    // The email link works once: a second visit shows the expired-link message.
    const again = await newContext(browser, testInfo);
    const reused = await again.newPage();
    await reused.goto(inviteLink);
    await expect(
      reused.getByText(
        'El enlace venció. Pedí una invitación nueva a quien te invitó.',
      ),
    ).toBeVisible();
    await again.close();

    // Signed in as somebody else, the same token is "unavailable" (the page never says why).
    const other = await newContext(browser, testInfo);
    const stranger = await other.newPage();
    await signIn(stranger, 'admin.tipas@domus.local');
    await stranger.goto(`/invitations/accept?token=${'a'.repeat(64)}`);
    await expect(unavailable(stranger)).toBeVisible();
    const forgedText = await stranger.locator('main').innerText();
    // The real, already-used token and a malformed one look exactly the same as a forged one.
    await stranger.goto(`/invitations/accept?token=${invitationToken}`);
    await expect(unavailable(stranger)).toBeVisible();
    expect(await stranger.locator('main').innerText()).toBe(forgedText);
    await stranger.goto('/invitations/accept?token=nope');
    await expect(unavailable(stranger)).toBeVisible();
    expect(await stranger.locator('main').innerText()).toBe(forgedText);
    await expect(
      stranger.getByRole('button', { name: 'Ingresar con otra cuenta' }),
    ).toBeVisible();

    // Signed out, a valid-looking token asks to sign in; the way back keeps the invitation.
    await other.clearCookies();
    await stranger.goto(`/invitations/accept?token=${'c'.repeat(64)}`);
    await stranger.getByRole('link', { name: 'Ingresar' }).click();
    await expect(stranger).toHaveURL(/\/login\?next=%2Finvitations%2Faccept/);
    await other.close();
  });

  test('edits the data and the billable criteria; the count is explained behind the info button', async () => {
    await admin.goto(`/platform/tenants/${tenantId}`);
    const data = admin.getByRole('form', { name: 'Datos del barrio' });
    await data.getByLabel('Dirección').fill('Avenida Nueva 456');
    await data
      .getByLabel('Zona horaria')
      .selectOption('America/Argentina/Buenos_Aires');
    await data.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(admin.getByText('Cambios guardados.').first()).toBeVisible();
    await admin.reload();
    await expect(
      admin
        .getByRole('form', { name: 'Datos del barrio' })
        .getByLabel('Dirección'),
    ).toHaveValue('Avenida Nueva 456');

    // D20: criteria only, with the "conteo disponible en H2" explanation behind an info button.
    await admin
      .getByRole('button', {
        name: 'Más información sobre las unidades facturables',
      })
      .click();
    await expect(
      admin.getByText(/el conteo está disponible en H2/),
    ).toBeVisible();
    await admin.keyboard.press('Escape');
    await admin.locator('label', { hasText: 'Vacía' }).click();
    await admin.getByRole('button', { name: 'Guardar criterios' }).click();
    await expect(admin.getByText('Cambios guardados.').last()).toBeVisible();
    await admin.reload();
    await expect(
      admin.getByRole('switch', { name: 'Vacía' }),
    ).not.toBeChecked();
    await expect(admin.getByRole('switch', { name: 'Ocupada' })).toBeChecked();

    // At least one status must stay selected.
    await admin.locator('label', { hasText: 'Ocupada' }).click();
    await admin.locator('label', { hasText: 'En obra' }).click();
    await admin.getByRole('button', { name: 'Guardar criterios' }).click();
    await expect(
      admin.getByText('Elegí al menos un estado de unidad.'),
    ).toBeVisible();
  });

  test('suspending states its effect first and gives members a read-only banner; cancelling closes the barrio with a clear page', async () => {
    const dialog = admin.getByRole('dialog');
    await admin.goto(`/platform/tenants/${tenantId}`);

    // Cancel the dialog: nothing changes.
    await admin
      .getByLabel('Nuevo estado')
      .selectOption({ label: 'Suspendido' });
    await admin.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('¿Pasar el barrio a Suspendido?');
    await expect(dialog).toContainText('solo lectura');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.getByRole('heading', { level: 1 })).toContainText(
      'Piloto',
    );

    // Confirm.
    await admin.getByRole('button', { name: 'Cambiar estado' }).click();
    await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(admin.getByText('Suscripción actualizada.')).toBeVisible();
    await expect(admin.getByRole('heading', { level: 1 })).toContainText(
      'Suspendido',
    );

    await invitee.goto('/');
    await expect(
      invitee
        .getByRole('status')
        .filter({ hasText: 'Barrio suspendido · solo lectura' }),
    ).toBeVisible();

    // Cancelled: no access, and the page says so (not the generic "no barrio" one).
    await admin.getByLabel('Nuevo estado').selectOption({ label: 'Baja' });
    await admin.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(dialog).toContainText('dejan de tener acceso');
    await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(admin.getByRole('heading', { level: 1 })).toContainText(
      'Baja',
    );

    await invitee.goto('/');
    await expect(
      invitee.getByRole('heading', { name: 'Tu barrio fue dado de baja' }),
    ).toBeVisible();
    await expect(invitee.getByText(tenantName)).toBeVisible();
    await expect(
      invitee.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();
    await expect(
      invitee.getByRole('heading', {
        name: 'Todavía no tenés un barrio asignado',
      }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(invitee);

    // Back to active for the support flow.
    await admin.getByLabel('Nuevo estado').selectOption({ label: 'Activo' });
    await admin.getByRole('button', { name: 'Cambiar estado' }).click();
    await dialog.getByRole('button', { name: 'Confirmar cambio' }).click();
    await expect(admin.getByRole('heading', { level: 1 })).toContainText(
      'Activo',
    );
    await invitee.goto('/');
    await expect(contextSelector(invitee)).toContainText(tenantName);
  });

  test('a support session shows a persistent banner, acts as the user, blocks account areas, audits as the admin, and ends back as the admin', async () => {
    await admin.goto('/platform/support');
    const person = admin.getByLabel('Persona', { exact: true });
    await admin
      .getByLabel('Barrio', { exact: true })
      .selectOption({ label: tenantName });
    await expect(
      person.locator('option', { hasText: `${ADMIN_FIRST} ${ADMIN_LAST}` }),
    ).toHaveCount(1);
    await person.selectOption({ index: 1 });

    // Reason is required; duration defaults to 30.
    await expect(admin.getByLabel('Duración (minutos)')).toHaveValue('30');
    await admin
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    await expect(admin.getByText('Escribí el motivo.')).toBeVisible();
    await admin
      .getByLabel('Motivo')
      .fill('Revisar un acceso que el administrador no ve');
    await admin
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();

    // Now acting as the user, in the same browser.
    await expect(admin).toHaveURL(/\/$/);
    const banner = admin.getByRole('region', { name: 'Sesión de soporte' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      `Soporte: estás viendo Domus como ${ADMIN_FIRST} ${ADMIN_LAST}`,
    );
    await expect(banner.getByRole('timer')).toContainText(
      /Quedan (29|30):\d\d/,
    );
    await expect(contextSelector(admin)).toContainText(tenantName);
    await expect(contextSelector(admin)).toContainText('Administrador');
    await expect(contextSelector(admin)).not.toContainText('Plataforma');

    // The banner cannot be missed at any width: inside the viewport, full width, and still there after scrolling.
    const box = await banner.boundingBox();
    const viewport = admin.viewportSize();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect(box?.width ?? 0).toBeLessThanOrEqual(viewport?.width ?? 0);
    await admin.goto('/registry');
    await admin.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(banner).toBeInViewport();
    await expectNoHorizontalOverflow(admin);

    // The token is a secret of the server: httpOnly cookie, never in the page.
    const cookie = (await adminContext.cookies()).find(
      (item) => item.name === 'domus-support',
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    supportToken = cookie?.value ?? '';
    expect(supportToken).not.toBe('');
    expect(await admin.evaluate(() => document.cookie)).not.toContain(
      'domus-support',
    );
    expect(await admin.content()).not.toContain(supportToken);
    const claims = jwtClaims(supportToken);
    supportSessionId = String(claims.support_session_id);

    // Security, invitations, sign-in and the platform area are closed: the controls are gone and the routes explain.
    await expect(
      admin.getByRole('link', { name: 'Seguridad de la cuenta' }),
    ).toHaveCount(0);
    await expect(
      admin.getByRole('button', { name: 'Cerrar sesión' }),
    ).toHaveCount(0);
    for (const path of [
      '/account/security',
      '/platform/tenants',
      '/platform/support',
      `/invitations/accept?token=${'d'.repeat(64)}`,
      '/login',
    ]) {
      await admin.goto(path);
      if (path === '/login') await expect(admin).toHaveURL(/\/$/);
      else {
        await expect(admin).toHaveURL(/\/support-blocked$/);
        await expect(
          admin.getByRole('heading', {
            name: 'No disponible durante el soporte',
          }),
        ).toBeVisible();
        await expect(banner).toBeVisible();
      }
    }

    // A write made with the support token (the one the server uses) is attributed to the real actor.
    const supportClient = clientWithToken(supportToken);
    const targetUserId = String(claims.sub);
    const rename = await supportClient
      .from('person')
      .update({ person_phone: '+54 381 555 0100' })
      .eq('user_id', targetUserId)
      .select('person_id');
    expect(rename.error).toBeNull();
    expect(rename.data).toHaveLength(1);
    const events = await auditEventsForSession(supportSessionId);
    const platformAdminId = await userIdByEmail(adminEmail);
    const personEvent = events.find(
      (event) =>
        event.audit_event_table_name === 'person' &&
        event.audit_event_action === 'update',
    );
    expect(personEvent?.audit_event_actor_user_id).toBe(platformAdminId);
    expect(personEvent?.audit_event_on_behalf_of_user_id).toBe(
      await userIdByEmail(inviteeEmail),
    );
    expect(
      events.some(
        (event) => event.audit_event_table_name === 'support_session',
      ),
    ).toBe(true);

    // The token cannot touch the account itself, even straight against the auth server.
    const authResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`,
      {
        method: 'PUT',
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
          authorization: `Bearer ${supportToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ password: 'OtraClave123!' }),
      },
    );
    expect(authResponse.ok).toBe(false);

    // End: back to the admin session, untouched.
    await admin.goto('/');
    await banner.getByRole('button', { name: 'Terminar' }).click();
    await expect(admin).toHaveURL(/\/platform\/support$/);
    await expect(
      admin.getByRole('heading', { name: 'Soporte', level: 1 }),
    ).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(
      (await adminContext.cookies()).some(
        (item) => item.name === 'domus-support',
      ),
    ).toBe(false);
    await expect(contextSelector(admin)).toContainText('Plataforma');
    // The ended session no longer works for anything.
    const dead = await supportClient
      .from('person')
      .select('person_id')
      .limit(1);
    expect(dead.data ?? []).toHaveLength(0);

    // History: it appears as finished, with the reason.
    const history = admin.getByRole('list', { name: 'Sesiones de soporte' });
    await expect(history).toContainText(tenantName);
    await expect(history).toContainText(
      'Revisar un acceso que el administrador no ve',
    );
    await expect(history).toContainText('Finalizada');
    await expectNoHorizontalOverflow(admin);
  });

  test('the barrio administrator sees the support session at /settings/support', async () => {
    await invitee.goto('/settings');
    await invitee.getByRole('link', { name: 'Accesos de soporte' }).click();
    await expect(invitee).toHaveURL(/\/settings\/support$/);
    const sessions = invitee.getByRole('list', {
      name: 'Accesos de soporte al barrio',
    });
    await expect(sessions).toContainText('Equipo de Domus');
    await expect(sessions).toContainText(`${ADMIN_FIRST} ${ADMIN_LAST}`);
    await expect(sessions).toContainText(
      'Revisar un acceso que el administrador no ve',
    );
    await expect(sessions).toContainText('Finalizada');
    await expect(sessions).toContainText(/\d+ min/);
    await expectNoHorizontalOverflow(invitee);
  });

  test('a support session ends by itself when its time is up', async () => {
    test.skip(
      isMobile(test.info()),
      'the same logic is covered at desktop width',
    );
    test.setTimeout(150_000);
    await admin.goto('/platform/support');
    await admin
      .getByLabel('Barrio', { exact: true })
      .selectOption({ label: tenantName });
    await expect(
      admin
        .getByLabel('Persona', { exact: true })
        .locator('option', { hasText: ADMIN_LAST }),
    ).toHaveCount(1);
    await admin
      .getByLabel('Persona', { exact: true })
      .selectOption({ index: 1 });
    await admin.getByLabel('Motivo').fill('Prueba de vencimiento');
    await admin.getByLabel('Duración (minutos)').fill('1');
    await admin
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();
    const banner = admin.getByRole('region', { name: 'Sesión de soporte' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('timer')).toContainText(/Quedan 0[01]:\d\d/);
    // Auto-exit: back on the admin's own area, no banner, no support cookie.
    await expect(admin).toHaveURL(/\/platform\/support$/, { timeout: 90_000 });
    await expect(banner).toHaveCount(0);
    expect(
      (await adminContext.cookies()).some(
        (item) => item.name === 'domus-support',
      ),
    ).toBe(false);
    await expect(
      admin.getByRole('list', { name: 'Sesiones de soporte' }),
    ).toContainText('Prueba de vencimiento');
  });

  test('an invitation can be revoked, and a revoked link no longer works', async ({
    browser,
  }, testInfo) => {
    const second = `e2e.second.${project(testInfo)}.${stamp}@domus.local`;
    extraEmails.push(second);
    await admin.goto(`/platform/tenants/${tenantId}`);
    const form = admin.locator('form').filter({
      has: admin.getByRole('heading', { name: 'Primer administrador' }),
    });
    await form.getByLabel('Nombre').fill('Segundo');
    await form.getByLabel('Apellido').fill('Admin');
    await form.getByLabel('Email').fill(second);
    await form.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(admin.getByText('Invitación enviada.')).toBeVisible();
    const link = extractAuthLink(await waitForEmailText(second));

    await admin
      .getByRole('button', { name: `Revocar la invitación de ${second}` })
      .click();
    const list = admin.getByRole('list', { name: 'Invitaciones del barrio' });
    await expect(
      list.getByRole('listitem').filter({ hasText: second }),
    ).toContainText('Revocada');

    const context = await newContext(browser, testInfo);
    const page = await context.newPage();
    await page.goto(link);
    await expect(
      page.getByText('Esta invitación no está disponible', { exact: true }),
    ).toBeVisible();
    await context.close();
  });
});

test.describe('access to the backoffice (M01-F05, S8)', () => {
  const PLATFORM_ROUTES = [
    '/platform',
    '/platform/tenants',
    '/platform/tenants/new',
    `/platform/tenants/${TENANT_IDS.ceibos}`,
    '/platform/support',
  ];

  test('a platform admin without a second factor reaches none of it, and the database refuses them too', async ({
    page,
  }) => {
    const admin = await createDisposableUser();
    try {
      await makePlatformAdmin(admin.userId);
      await signIn(page, admin.email, admin.password);
      for (const path of PLATFORM_ROUTES) {
        await page.goto(path);
        await expect(page).toHaveURL(/\/account\/security\?next=%2Fplatform/);
        await expect(
          page.getByRole('button', { name: 'Activar verificación' }),
        ).toBeVisible();
      }

      // Even with their own valid (aal1) token, the platform operations are denied by the database.
      const client = clientWithToken(
        await accessTokenFromCookies(await page.context().cookies()),
      );
      const created = await client.rpc('create_tenant', {
        tenant_name: 'No debería existir',
        tenant_slug: `no-${stamp}`,
      });
      expect(created.error?.code).toBe('42501');
      const targets = await client.rpc('list_support_targets', {
        target_tenant_id: TENANT_IDS.ceibos,
      });
      expect(targets.error?.code).toBe('42501');
      const support = await client.rpc('start_support_session', {
        target_tenant_id: TENANT_IDS.ceibos,
        target_user_id: await userIdByEmail(ACCOUNTS.adminCeibos),
        reason: 'sin MFA',
        client_event_id: crypto.randomUUID(),
      });
      expect(support.error?.code).toBe('42501');
      const tenants = await client.from('tenant').select('tenant_id');
      expect(tenants.data ?? []).toHaveLength(0);
    } finally {
      await cleanUp({ emails: [admin.email] });
    }
  });

  test('a tenant administrator is sent away from every platform route', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.adminCeibos);
    for (const path of PLATFORM_ROUTES) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/$/);
    }
    await expect(contextSelector(page)).not.toContainText('Plataforma');
  });

  test('a visitor is sent to sign in first', async ({ page }) => {
    for (const path of ['/platform/tenants/new', '/platform/support']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=%2Fplatform/);
    }
    await page.goto('/settings/support');
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fsupport$/);
  });

  test('support accesses are for administrators with the access-audit permission only', async ({
    page,
  }) => {
    const { tenantId } = await createTenant(
      `Barrio Permisos ${stamp}`,
      'active',
    );
    const admin = await createDisposableUser();
    const holder = await createDisposableUser();
    try {
      // A tenant admin without permissions: told what is missing, not shown an empty list.
      await addMembership(admin.userId, tenantId, 'tenant_admin');
      await signIn(page, admin.email, admin.password);
      await page.goto('/settings/support');
      await expect(
        page.getByText(
          'Necesitás el permiso de auditoría de accesos para ver esta página',
        ),
      ).toBeVisible();

      // A resident has no such page at all.
      await page.context().clearCookies();
      await addMembership(holder.userId, tenantId, 'unit_holder');
      await signIn(page, holder.email, holder.password);
      const response = await page.goto('/settings/support');
      expect(response?.status()).toBe(404);
    } finally {
      await cleanUp({
        tenantIds: [tenantId],
        emails: [admin.email, holder.email],
      });
    }
  });
});
