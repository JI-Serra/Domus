import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './support/accounts';
import { contextSelector, loginWithPassword } from './support/flows';

// Documentation captures (docs/screenshots/h0). Opt in with `E2E_SCREENSHOTS=1 pnpm test:e2e screenshots`.
test.skip(
  !process.env.E2E_SCREENSHOTS,
  'set E2E_SCREENSHOTS=1 to refresh the screenshots',
);

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h0',
);

function widthOf(projectName: string): number {
  return projectName === 'mobile-360' ? 360 : 1440;
}

test('login page (light)', async ({ page }, testInfo) => {
  await page.goto('/ingresar');
  await expect(
    page.getByRole('heading', { name: 'Ingresá a Domus' }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(
      OUTPUT,
      `login-${widthOf(testInfo.project.name)}-light.png`,
    ),
  });
});

test('real context selector with the two-barrio user (light)', async ({
  page,
}, testInfo) => {
  await loginWithPassword(page, ACCOUNTS.shared);
  await contextSelector(page).click();
  await expect(
    page.getByRole('group', { name: 'Cambiar de contexto' }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(
      OUTPUT,
      `context-selector-${widthOf(testInfo.project.name)}-light.png`,
    ),
  });
});
