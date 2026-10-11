import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { addMembership, cleanUp } from './support/database';
import { loginWithPassword, newContext, signIn } from './support/flows';
import {
  createRegistryAdmin,
  openRegistrySection,
  uniqueSuffix,
} from './support/registry';
import type { RegistryAdmin } from './support/registry';
import { createDisposableUser } from './support/supabase';

// Documentation captures of the M02 admin area (docs/screenshots/h2). Opt in with
// `E2E_SCREENSHOTS=1 pnpm --filter @domus/web exec playwright test screenshots-h2`.
test.skip(
  !process.env.E2E_SCREENSHOTS,
  'set E2E_SCREENSHOTS=1 to refresh the screenshots',
);

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h2',
);
const FIXTURE = path.resolve(
  process.cwd(),
  '../../supabase/fixtures/registry-demo-150.csv',
);
const widthOf = (testInfo: TestInfo) =>
  testInfo.project.name === 'mobile-360' ? 360 : 1440;

async function capture(
  target: Page | Locator,
  name: string,
  testInfo: TestInfo,
  options: { tall?: boolean } = {},
) {
  const width = widthOf(testInfo);
  const file = path.join(OUTPUT, `registry-${name}-${width}-light.png`);
  if (options.tall && 'setViewportSize' in target) {
    // A tall viewport instead of `fullPage`: sticky bars would otherwise be painted over the middle of the page.
    const original = target.viewportSize();
    // The viewport grows to the content (at least a screen, at most a long page) before the capture.
    const content = await target.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await target.setViewportSize({
      width,
      height: Math.min(Math.max(content + 8, 740), 2600),
    });
    await target.screenshot({ path: file });
    if (original) await target.setViewportSize(original);
    return;
  }
  await target.screenshot({ path: file });
}

test.describe.serial('M02 admin screenshots (1440 and 360, light)', () => {
  test.setTimeout(240_000);

  let admin: RegistryAdmin;
  let page: Page;
  const emails: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    const suffix = uniqueSuffix(testInfo);
    admin = await createRegistryAdmin(`Barrio Capturas ${suffix}`);
    emails.push(admin.email);
    const context = await newContext(browser, testInfo);
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    await page?.context().close();
    await cleanUp({ tenantIds: [admin.tenantId], emails });
  });

  test('import', async () => {
    const testInfo = test.info();
    await openRegistrySection(page, 'Importar');
    await capture(page, 'import-empty', testInfo);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'unidades.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'unit_code,unit_status,unit_coefficient,person_first_name,person_last_name,person_email\r\nMz 1 Lote 1,occupied,1,Ana,Gómez,ana@ejemplo.com\r\nMz 1 Lote 2,vacant,abc,,,\r\nMz 1 Lote 3,occupied,1,Beto,,\r\n',
      ),
    });
    await expect(page.getByTestId('import-errors')).toHaveText('2');
    await capture(page, 'import-errors', testInfo, { tall: true });

    await page.locator('input[type="file"]').setInputFiles(FIXTURE);
    await expect(page.getByTestId('import-rows')).toHaveText('450');
    await capture(page, 'import-preview', testInfo, { tall: true });
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByText('Todo está listo para importar.')).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Confirmar importación' }).click();
    await expect(page.getByTestId('import-outcome')).toBeVisible({
      timeout: 60_000,
    });
    await capture(page, 'import-result', testInfo);
  });

  test('units, form and search', async () => {
    const testInfo = test.info();
    await openRegistrySection(page, 'Unidades');
    await capture(page, 'units', testInfo, { tall: true });

    await page.getByRole('link', { name: 'Nueva unidad' }).click();
    await page.getByLabel('Estado', { exact: true }).selectOption('occupied');
    await capture(page, 'unit-form', testInfo, { tall: true });

    await page.goto('/registry/units');
    const search = page.getByRole('combobox', { name: 'Buscar en el padrón' });
    await search.fill('Familia1');
    await expect(page.getByRole('option').first()).toBeVisible();
    await search.press('ArrowDown');
    await capture(page, 'search', testInfo);
  });

  test('unit 360', async () => {
    const testInfo = test.info();
    await page.goto('/registry/units?q=Demo+Mz+1+Lote+1');
    await page
      .getByRole('link', { name: 'Demo Mz 1 Lote 1', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Agregar', exact: true })
      .first()
      .click();
    const vehicle = page.getByRole('dialog', { name: 'Agregar vehículo' });
    await vehicle.getByLabel('Patente').fill('AB123CD');
    await vehicle.getByLabel('Marca').fill('Renault');
    await vehicle.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('AB123CD')).toBeVisible();

    await page.getByRole('button', { name: 'Código de la unidad' }).click();
    await page.getByRole('button', { name: 'Generar código' }).click();
    await expect(page.getByTestId('one-time-secret')).toBeVisible();
    await capture(page, 'unit-360', testInfo, { tall: true });

    await page
      .getByRole('button', { name: /^Invitar a / })
      .first()
      .click();
    await capture(page, 'invite-resident', testInfo);
  });

  test('guards, gates and devices', async ({ browser }, testInfo) => {
    const guard = await createDisposableUser();
    emails.push(guard.email);
    await addMembership(guard.userId, admin.tenantId, 'guard', {
      first: 'Gabi',
      last: 'Guardia',
    });

    // The previous capture left a sheet open on the unit sheet: start from a clean page.
    await page.goto('/registry/units');
    await openRegistrySection(page, 'Puestos');
    await page.getByRole('button', { name: 'Nuevo puesto' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nuevo puesto' });
    await sheet.getByLabel('Nombre', { exact: true }).fill('Acceso principal');
    await sheet.getByRole('button', { name: 'Crear puesto' }).click();
    await expect(
      page.getByRole('list', { name: 'Puestos del barrio' }),
    ).toContainText('Acceso principal');

    await page.getByRole('button', { name: /Vincular una tablet/ }).click();
    await expect(page.getByTestId('one-time-secret')).toBeVisible();
    const code =
      (await page.getByTestId('one-time-secret').textContent()) ?? '';
    await capture(page, 'gates-pairing', testInfo);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    const tablet = await newContext(browser, testInfo);
    const tabletPage = await tablet.newPage();
    await signIn(tabletPage, guard.email);
    await tabletPage.goto('/devices/pair');
    await tabletPage.getByLabel('Nombre del dispositivo').fill('Tablet garita');
    await capture(tabletPage, 'devices-pair', testInfo);
    await tabletPage.getByLabel('Código de vinculación').fill(code);
    await tabletPage
      .getByRole('button', { name: 'Vincular', exact: true })
      .click();
    await expect(tabletPage.getByTestId('pair-success')).toBeVisible();
    await tablet.close();

    await page.reload();
    await expect(
      page.getByRole('table', { name: 'Dispositivos vinculados' }),
    ).toContainText('Tablet garita');
    await capture(page, 'gates', testInfo, { tall: true });

    await openRegistrySection(page, 'Guardias');
    await page.getByLabel('Nombre', { exact: true }).fill('Nico');
    await page.getByLabel('Apellido', { exact: true }).fill('Nuevo');
    const nico = `e2e.nico.${Date.now()}@domus.local`;
    emails.push(nico);
    await page.getByLabel('Email', { exact: true }).fill(nico);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByText('Invitación enviada.')).toBeVisible();
    await capture(page, 'guards', testInfo, { tall: true });
  });
});
