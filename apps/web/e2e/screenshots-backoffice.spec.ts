import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Locator, Page, TestInfo } from '@playwright/test';
import {
  addMembership,
  cleanUp,
  createTenant,
  grantPermission,
  makePlatformAdmin,
  setTenantStatus,
  tenantIdByName,
} from './support/database';
import { PNG, enrollTotp, newContext, signIn } from './support/flows';
import { extractAuthLink, waitForEmailText } from './support/mailpit';
import { followAuthLink } from './support/registry';
import {
  accessTokenFromCookies,
  clientWithToken,
  createDisposableUser,
} from './support/supabase';

// Documentation captures of the M01 backoffice (docs/screenshots/h1). Opt in with
// `E2E_SCREENSHOTS=1 pnpm --filter @domus/web exec playwright test screenshots-backoffice`.
test.skip(
  !process.env.E2E_SCREENSHOTS,
  'set E2E_SCREENSHOTS=1 to refresh the screenshots',
);

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h1',
);
const widthOf = (testInfo: TestInfo) =>
  testInfo.project.name === 'mobile-360' ? 360 : 1440;

async function capture(
  target: Page | Locator,
  name: string,
  testInfo: TestInfo,
  theme: 'light' | 'dark' = 'light',
  options: { fullPage?: boolean } = {},
) {
  const file = path.join(
    OUTPUT,
    `backoffice-${name}-${widthOf(testInfo)}-${theme}.png`,
  );
  if (!options.fullPage || !('setViewportSize' in target)) {
    await target.screenshot({ path: file });
    return;
  }
  // A tall viewport instead of `fullPage`: sticky bars would otherwise be painted over the middle of the page.
  const original = target.viewportSize();
  const width = original?.width ?? widthOf(testInfo);
  await target.setViewportSize({ width, height: width === 360 ? 1900 : 1500 });
  await target.screenshot({ path: file });
  if (original) await target.setViewportSize(original);
}

/** Dark theme before first paint, the same way the app's pre-paint script reads it. */
async function darkTheme(context: BrowserContext) {
  await context.addInitScript(() =>
    localStorage.setItem('domus.theme', 'dark'),
  );
}

test.describe.serial('backoffice screenshots', () => {
  test.setTimeout(180_000);
  const stamp = `${Date.now()}`.slice(-8);
  const tenantName = 'Barrio Los Ceibos';
  const adminEmail = `e2e.shot.admin.${stamp}@domus.local`;
  let targetEmail = '';
  const emails: string[] = [];
  const tenantIds: string[] = [];
  let tenantId = '';
  let admin: Page;
  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }, testInfo) => {
    const platformAdmin = await createDisposableUser();
    emails.push(platformAdmin.email, adminEmail);
    await makePlatformAdmin(platformAdmin.userId);
    adminContext = await newContext(browser, testInfo);
    admin = await adminContext.newPage();
    await signIn(admin, platformAdmin.email, platformAdmin.password);
    await admin.goto('/platform/tenants');
    await enrollTotp(admin);
    await expect(admin).toHaveURL(/\/platform\/tenants$/);

    // The barrio the screenshots are about, plus a second one in another state for the list.
    const created = await createTenant(`${tenantName} ${stamp}`, 'active');
    tenantId = created.tenantId;
    tenantIds.push(tenantId);
    const other = await createTenant(`Barrio Las Tipas ${stamp}`, 'suspended');
    tenantIds.push(other.tenantId);
    const third = await createTenant(`Barrio Altos del Tala ${stamp}`, 'pilot');
    tenantIds.push(third.tenantId);
    const target = await createDisposableUser();
    await addMembership(target.userId, tenantId, 'tenant_admin', {
      first: 'Marta',
      last: 'Soporte',
    });
    await grantPermission(target.userId, tenantId, 'access_audit');
    targetEmail = target.email;
    emails.push(target.email);
  });

  test.afterAll(async () => {
    // Logos are removed through the Storage API as the platform admin; everything else with SQL.
    try {
      const token = await accessTokenFromCookies(await adminContext.cookies());
      const storage = clientWithToken(token).storage.from('tenant-logo');
      for (const id of tenantIds) {
        const { data } = await storage.list(id);
        if (data?.length)
          await storage.remove(data.map((file) => `${id}/${file.name}`));
      }
    } catch {
      // Nothing to remove if the session is gone.
    }
    await adminContext?.close();
    for (const id of tenantIds)
      await setTenantStatus(id, 'active').catch(() => {});
    await cleanUp({ tenantIds, emails });
  });

  test('list, creation form and detail', async ({ browser }, testInfo) => {
    await admin.goto('/platform/tenants');
    await expect(
      admin.getByRole('table', { name: 'Lista de barrios' }),
    ).toBeVisible();
    await capture(admin, 'tenants', testInfo);

    await admin.goto('/platform/tenants/new');
    await admin
      .getByLabel('Nombre', { exact: true })
      .fill('Barrio Nuevo Horizonte');
    await admin.getByLabel('Dirección').fill('Ruta 38 km 12, Yerba Buena');
    await capture(admin, 'tenant-new', testInfo, 'light', { fullPage: true });

    // Create one with a logo for the detail page.
    await admin.locator('input[type="file"][name="logo"]').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await admin.getByRole('button', { name: 'Crear barrio' }).click();
    await expect(admin).toHaveURL(/\/platform\/tenants\/[0-9a-f-]{36}$/);
    const created = await tenantIdByName('Barrio Nuevo Horizonte');
    tenantIds.push(created);

    // Invite the first admin so the invitation list is shown, and follow the email for the acceptance screenshot.
    const form = admin.locator('form').filter({
      has: admin.getByRole('heading', { name: 'Primer administrador' }),
    });
    await form.getByLabel('Nombre').fill('Lucía');
    await form.getByLabel('Apellido').fill('Fernández');
    await form.getByLabel('Email').fill(adminEmail);
    await form.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(admin.getByText('Invitación enviada.')).toBeVisible();
    await capture(admin, 'tenant-detail', testInfo, 'light', {
      fullPage: true,
    });

    await admin
      .getByLabel('Nuevo estado')
      .selectOption({ label: 'Suspendido' });
    await admin.getByRole('button', { name: 'Cambiar estado' }).click();
    await expect(admin.getByRole('dialog')).toBeVisible();
    await capture(admin, 'subscription-confirm', testInfo);
    await admin
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancelar' })
      .click();

    const link = extractAuthLink(await waitForEmailText(adminEmail));
    const invited = await newContext(browser, testInfo);
    const page = await invited.newPage();
    await followAuthLink(page, link);
    await expect(
      page.getByRole('heading', { name: 'Invitación a un barrio' }),
    ).toBeVisible();
    await expect(
      page.getByText('Barrio Nuevo Horizonte', { exact: true }),
    ).toBeVisible();
    await capture(page, 'invitation-accept', testInfo);
    await invited.close();
  });

  test('support: start form, impersonation banner (light and dark), audit view and cancelled barrio', async ({
    browser,
  }, testInfo) => {
    await admin.goto('/platform/support');
    await admin
      .getByLabel('Barrio', { exact: true })
      .selectOption({ label: `${tenantName} ${stamp}` });
    await expect(
      admin
        .getByLabel('Persona', { exact: true })
        .locator('option', { hasText: 'Marta Soporte' }),
    ).toHaveCount(1);
    await admin
      .getByLabel('Persona', { exact: true })
      .selectOption({ index: 1 });
    await admin
      .getByLabel('Motivo')
      .fill('Revisar por qué un invitado no pudo ingresar');
    await capture(admin, 'support-start', testInfo, 'light', {
      fullPage: true,
    });
    await admin
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click();

    const banner = admin.getByRole('region', { name: 'Sesión de soporte' });
    await expect(banner).toBeVisible();
    await expect(
      admin.getByRole('heading', { name: 'Inicio', level: 1 }),
    ).toBeVisible();
    await capture(admin, 'impersonation-banner', testInfo, 'light');
    await capture(banner, 'impersonation-banner-only', testInfo, 'light');

    // The same session in dark: copy the support cookie into a dark-theme context (screenshot only).
    const cookies = await adminContext.cookies();
    const dark = await newContext(browser, testInfo, 'dark');
    await darkTheme(dark);
    await dark.addCookies(cookies);
    const darkPage = await dark.newPage();
    await darkPage.goto('/');
    const darkBanner = darkPage.getByRole('region', {
      name: 'Sesión de soporte',
    });
    await expect(darkBanner).toBeVisible();
    await expect(darkPage.locator('html')).toHaveAttribute(
      'data-theme',
      'dark',
    );
    await capture(darkPage, 'impersonation-banner', testInfo, 'dark');
    await capture(darkBanner, 'impersonation-banner-only', testInfo, 'dark');
    await darkPage.goto('/account/security');
    await expect(darkPage).toHaveURL(/\/support-blocked$/);
    await capture(darkPage, 'support-blocked', testInfo, 'dark');
    await dark.close();

    await admin.goto('/account/security');
    await expect(admin).toHaveURL(/\/support-blocked$/);
    await capture(admin, 'support-blocked', testInfo);
    await admin.getByRole('button', { name: 'Terminar' }).click();
    await expect(admin).toHaveURL(/\/platform\/support$/);
    await expect(
      admin.getByRole('list', { name: 'Sesiones de soporte' }),
    ).toContainText('Finalizada');
    await capture(admin, 'support-history', testInfo, 'light', {
      fullPage: true,
    });

    // What the barrio's administrator sees.
    const tenantAdmin = await newContext(browser, testInfo);
    const tenantPage = await tenantAdmin.newPage();
    await signIn(tenantPage, targetEmail);
    await tenantPage.goto('/settings/support');
    await expect(
      tenantPage.getByRole('list', { name: 'Accesos de soporte al barrio' }),
    ).toContainText('Equipo de Domus');
    await capture(tenantPage, 'settings-support', testInfo);

    // And the page of a user whose barrio was cancelled.
    await setTenantStatus(tenantId, 'cancelled');
    await tenantPage.goto('/');
    await expect(
      tenantPage.getByRole('heading', { name: 'Tu barrio fue dado de baja' }),
    ).toBeVisible();
    await capture(tenantPage, 'tenant-cancelled', testInfo);
    await tenantAdmin.close();
  });
});
