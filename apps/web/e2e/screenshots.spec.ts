import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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

const THEMES = {
  light: { theme: null, gate: false },
  dark: { theme: 'dark', gate: false },
  gate: { theme: null, gate: true },
  'gate-dark': { theme: 'dark', gate: true },
} as const;

/** Applies a theme/gate preference before the first paint, the same way the pre-paint script reads it. */
async function usePreference(page: Page, name: keyof typeof THEMES) {
  const { theme, gate } = THEMES[name];
  await page.addInitScript(
    ({ theme, gate }) => {
      if (theme) localStorage.setItem('domus.theme', theme);
      if (gate) localStorage.setItem('domus.gate', '1');
    },
    { theme, gate },
  );
}

for (const name of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
  test(`design page (${name})`, async ({ page }, testInfo) => {
    await usePreference(page, name);
    await page.goto('/design');
    await expect(
      page.getByRole('heading', { name: 'Sistema de diseño', level: 1 }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        OUTPUT,
        `design-${widthOf(testInfo.project.name)}-${name}.png`,
      ),
      fullPage: true,
    });
  });

  test(`home shell (${name})`, async ({ page }, testInfo) => {
    await usePreference(page, name);
    await loginWithPassword(page, ACCOUNTS.shared);
    await expect(
      page.getByRole('heading', { name: 'Inicio', level: 1 }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        OUTPUT,
        `shell-${widthOf(testInfo.project.name)}-${name}.png`,
      ),
    });
  });
}

test('info button open (light)', async ({ page }, testInfo) => {
  await page.goto('/design');
  await page
    .getByRole('button', { name: 'Más información sobre esta página' })
    .click();
  await expect(
    page.getByRole('group', { name: 'Más información sobre esta página' }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(
      OUTPUT,
      `info-button-${widthOf(testInfo.project.name)}-light.png`,
    ),
  });
});

test('login page (light)', async ({ page }, testInfo) => {
  await page.goto('/login');
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
