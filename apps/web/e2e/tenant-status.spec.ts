import { expect, test } from '@playwright/test';
import {
  addMembership,
  createTenant,
  setTenantStatus,
} from './support/database';
import type { TenantSubscriptionStatus } from './support/database';
import {
  expectNoHorizontalOverflow,
  loginWithPassword,
  signIn,
} from './support/flows';
import { createDisposableUser } from './support/supabase';

// The status is changed with SQL on a barrio created for the test (test-only setup, local database): the app has
// no way to change it yet, and the seeded barrios stay untouched for the other suites.
test.describe('subscription status in the shell (M01-F02)', () => {
  let tenantId: string;
  let tenantName: string;
  let email: string;
  let password: string;

  test.beforeAll(async () => {
    ({ tenantId, tenantName } = await createTenant(
      `Barrio Estado ${Date.now()}`,
    ));
    const user = await createDisposableUser();
    ({ email, password } = user);
    await addMembership(user.userId, tenantId, 'tenant_admin');
  });

  const banner = (page: import('@playwright/test').Page) =>
    page.getByRole('status').filter({ hasText: 'Barrio suspendido' });

  async function asStatus(
    page: import('@playwright/test').Page,
    status: TenantSubscriptionStatus,
  ) {
    await setTenantStatus(tenantId, status);
    await page.context().clearCookies();
    await loginWithPassword(page, email, password);
  }

  test('a suspended barrio shows a compact read-only banner on every page, with details behind the info button', async ({
    page,
  }) => {
    await asStatus(page, 'suspended');
    await expect(banner(page)).toHaveText(/Barrio suspendido · solo lectura/);
    await expect(
      page.getByRole('heading', { name: 'Inicio', level: 1 }),
    ).toBeVisible();

    // Persistent: it follows the user to the other pages.
    await page.goto('/registry');
    await expect(banner(page)).toBeVisible();
    await page.goto('/account/security');
    await expect(banner(page)).toBeVisible();

    await page
      .getByRole('button', {
        name: 'Más información sobre el barrio suspendido',
      })
      .click();
    await expect(
      page.getByText(/La garita sigue validando los accesos/),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Persistent: it stays in view (stuck under the top bar) while the page scrolls.
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrolled = await banner(page).boundingBox();
    expect(scrolled?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(scrolled?.y ?? 999).toBeLessThan(120);

    // Compact: a single bar, not a block of text.
    const box = await banner(page).boundingBox();
    expect(box?.height ?? 999).toBeLessThan(80);
  });

  for (const status of ['pilot', 'active'] as const) {
    test(`a ${status} barrio shows no banner`, async ({ page }) => {
      await asStatus(page, status);
      await expect(
        page.getByRole('heading', { name: 'Inicio', level: 1 }),
      ).toBeVisible();
      await expect(banner(page)).toHaveCount(0);
      await expect(page.getByRole('banner')).toContainText(tenantName);
    });
  }

  test('a cancelled barrio is closed at the database: its members see no barrio and no data, only the way out and their account', async ({
    page,
  }) => {
    // `member_tenant_ids()` leaves cancelled barrios out, so the user's RLS client cannot even read the tenant row
    // and the membership does not resolve: the shell never opens (the blocking page is defense in depth).
    await setTenantStatus(tenantId, 'cancelled');
    await page.context().clearCookies();
    await signIn(page, email, password);
    const noBarrio = page.getByRole('heading', {
      name: 'Todavía no tenés un barrio asignado',
    });
    await expect(noBarrio).toBeVisible();
    await expect(page.getByText(tenantName)).toHaveCount(0);

    await page.goto('/registry');
    await expect(noBarrio).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cerrar sesión' }),
    ).toBeVisible();

    // The account pages keep working (the user can still manage their sign-in security).
    await page.goto('/account/security');
    await expect(
      page.getByRole('heading', { name: 'Seguridad', level: 1 }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test.afterAll(async () => {
    await setTenantStatus(tenantId, 'active');
  });
});
