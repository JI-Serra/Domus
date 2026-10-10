import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  addMembership,
  createTenant,
  setTenantStatus,
} from './support/database';
import { answerChallenge, enrollTotp, signIn, logout } from './support/flows';
import { createDisposableUser } from './support/supabase';
import { totpCode } from './support/totp';

// Documentation captures (docs/screenshots/h1). Opt in with `E2E_SCREENSHOTS=1 pnpm test:e2e screenshots-h1`.
test.skip(
  !process.env.E2E_SCREENSHOTS,
  'set E2E_SCREENSHOTS=1 to refresh the screenshots',
);

const OUTPUT = path.resolve(
  import.meta.dirname,
  '../../../docs/screenshots/h1',
);

function widthOf(projectName: string): number {
  return projectName === 'mobile-360' ? 360 : 1440;
}

const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Applies the theme before the first paint, the same way the pre-paint script reads it. */
async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    if (value === 'dark') localStorage.setItem('domus.theme', 'dark');
  }, theme);
}

async function capture(
  target: Page | Locator,
  name: string,
  projectName: string,
  theme: Theme,
  options: { fullPage?: boolean } = {},
) {
  await target.screenshot({
    path: path.join(OUTPUT, `${name}-${widthOf(projectName)}-${theme}.png`),
    ...options,
  });
}

for (const theme of THEMES) {
  test.describe(`h1 screenshots (${theme})`, () => {
    test(`login with the logo`, async ({ page }, testInfo) => {
      await useTheme(page, theme);
      await page.goto('/login');
      await expect(page.getByRole('img', { name: 'Domus' })).toBeVisible();
      await capture(page, 'login', testInfo.project.name, theme);
    });

    test(`design: Marca section`, async ({ page }, testInfo) => {
      await useTheme(page, theme);
      await page.goto('/design#brand');
      const section = page.getByRole('region', { name: 'Marca' });
      await expect(section).toBeVisible();
      await capture(section, 'design-brand', testInfo.project.name, theme);
    });

    test(`shell (sidebar with the logo, top bar with the emblem), suspended banner, MFA enrollment and challenge`, async ({
      page,
    }, testInfo) => {
      const project = testInfo.project.name;
      await useTheme(page, theme);

      // A tenant admin of a barrio that is suspended, so the same session shows shell and banner.
      const { tenantId } = await createTenant(`Barrio Los Ceibos`, 'active');
      const user = await createDisposableUser();
      await addMembership(user.userId, tenantId, 'tenant_admin');

      await signIn(page, user.email, user.password);
      await expect(
        page.getByRole('heading', { name: 'Inicio', level: 1 }),
      ).toBeVisible();
      await capture(page, 'shell', project, theme);

      await setTenantStatus(tenantId, 'suspended');
      await page.reload();
      await expect(
        page.getByRole('status').filter({ hasText: 'Barrio suspendido' }),
      ).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await capture(page, 'suspended-banner', project, theme);
      await setTenantStatus(tenantId, 'active');

      await page.goto('/account/security');
      await page.getByRole('button', { name: 'Activar verificación' }).click();
      await expect(
        page.getByRole('img', {
          name: 'Código QR para agregar Domus a tu app de autenticación',
        }),
      ).toBeVisible();
      await capture(page, 'mfa-enrollment', project, theme);

      await page.getByRole('button', { name: 'Cancelar' }).click();
      const secret = await enrollTotp(page);
      await expect(page.getByText('Activada', { exact: true })).toBeVisible();
      await logout(page);
      await signIn(page, user.email, user.password);
      await expect(
        page.getByRole('heading', { name: 'Ingresá el código', level: 1 }),
      ).toBeVisible();
      await capture(page, 'mfa-challenge', project, theme);

      // Leave the account usable: answer the challenge (the code of the next window, never reused).
      await answerChallenge(page, totpCode(secret, 1));
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
}
