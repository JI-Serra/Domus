import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { cleanUp } from './support/database';
import { loginWithPassword, newContext } from './support/flows';
import { createRegistryAdmin, uniqueSuffix } from './support/registry';
import type { RegistryAdmin } from './support/registry';

// Documentation captures of the M03 access policy area (docs/screenshots/h3). Opt in with
// `E2E_SCREENSHOTS=1 pnpm --filter @domus/web exec playwright test screenshots-h3`.
test.skip(
  !process.env.E2E_SCREENSHOTS,
  'set E2E_SCREENSHOTS=1 to refresh the screenshots',
);

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h3',
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
  const file = path.join(OUTPUT, `access-policy-${name}-${width}-light.png`);
  if (options.tall && 'setViewportSize' in target) {
    // A tall viewport instead of `fullPage`: sticky bars would otherwise be painted over the middle of the page.
    const original = target.viewportSize();
    const content = await target.evaluate(
      () => document.documentElement.scrollHeight,
    );
    await target.setViewportSize({
      width,
      height: Math.min(Math.max(content + 8, 740), 3200),
    });
    await target.screenshot({ path: file });
    if (original) await target.setViewportSize(original);
    return;
  }
  await target.screenshot({ path: file });
}

test.describe
  .serial('M03 access policy screenshots (1440 and 360, light)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let page: Page;
  const emails: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    admin = await createRegistryAdmin(
      `Barrio Capturas ${uniqueSuffix(testInfo)}`,
      ['access_config', 'registry'],
    );
    emails.push(admin.email);
    page = await (await newContext(browser, testInfo)).newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    await page?.context().close();
    await cleanUp({ tenantIds: [admin.tenantId], emails });
  });

  test('matrix, limits and templates', async () => {
    const testInfo = test.info();
    await page.goto('/settings/access-policy');
    await expect(page.getByText('Aplicada: Equilibrado')).toBeVisible();
    await capture(page, 'matrix', testInfo, { tall: true });
  });

  test('diff preview of a template', async () => {
    const testInfo = test.info();
    await page.goto('/settings/access-policy');
    await page
      .getByRole('button', { name: 'Ver los cambios de la plantilla Flexible' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Plantilla Flexible' });
    await expect(sheet).toBeVisible();
    await capture(page, 'template-diff', testInfo);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Aplicar plantilla' })
      .click();
    await expect(page.getByText('Plantilla aplicada.')).toBeVisible();
  });

  test('history', async () => {
    const testInfo = test.info();
    await page.goto('/settings/access-policy');
    // One manual edit, so the history shows both kinds of entry.
    await page
      .getByRole('group', { name: 'Delivery', exact: true })
      .getByRole('combobox', { name: 'Por defecto' })
      .selectOption('direct_entry');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Reglamento guardado.')).toBeVisible();
    await page.goto('/settings/access-policy/history');
    await expect(
      page.getByRole('list', { name: 'Cambios del reglamento' }),
    ).toBeVisible();
    await capture(page, 'history', testInfo, { tall: true });
  });

  test('read-only view for an administrator without access_config', async ({
    browser,
  }, testInfo) => {
    const other = await (await newContext(browser, testInfo)).newPage();
    await loginWithPassword(other, 'registry.ceibos@domus.local');
    await other.goto('/settings/access-policy');
    await expect(other.getByText('Solo lectura')).toBeVisible();
    await capture(other, 'read-only', testInfo, { tall: true });
    await other.context().close();
  });
});
