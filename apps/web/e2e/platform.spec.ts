import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './support/accounts';
import { makePlatformAdmin } from './support/database';
import {
  answerChallenge,
  contextSelector,
  enrollTotp,
  loginWithPassword,
  logout,
  signIn,
} from './support/flows';
import { createDisposableUser } from './support/supabase';
import { totpCode } from './support/totp';

// platform@domus.local is a seeded platform admin without a factor; the tests never enroll it (that would change
// the shared fixture), they use their own disposable platform admins for the flows that do.
const SEEDED_PLATFORM_ADMIN = 'platform@domus.local';

test.describe('platform area (M01-F05)', () => {
  test('a platform admin without a factor is sent to enrollment, with the reason', async ({
    page,
  }) => {
    await signIn(page, SEEDED_PLATFORM_ADMIN);
    await page.goto('/platform/tenants');
    await expect(page).toHaveURL(
      /\/account\/security\?next=%2Fplatform%2Ftenants$/,
    );
    await expect(
      page.getByText(
        'Activá la verificación en dos pasos para entrar a la plataforma.',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Activar verificación' }),
    ).toBeVisible();

    // Every platform route is guarded, and so is the area root.
    await page.goto('/platform');
    await expect(page).toHaveURL(/\/account\/security\?next=%2Fplatform$/);
    await page.goto('/platform/support');
    await expect(page).toHaveURL(
      /\/account\/security\?next=%2Fplatform%2Fsupport$/,
    );
  });

  test('enrolling continues to the platform, which then asks for the code on every new session', async ({
    page,
  }) => {
    const admin = await createDisposableUser();
    await makePlatformAdmin(admin.userId);

    // aal1, no factor: /platform -> enrollment -> platform at aal2.
    await signIn(page, admin.email, admin.password);
    await page.goto('/platform');
    await expect(page).toHaveURL(/\/account\/security\?next=%2Fplatform$/);
    const secret = await enrollTotp(page);
    await expect(page).toHaveURL(/\/platform\/tenants$/);

    // The platform shell: own navigation, platform context, no tenant sections.
    await expect(
      page.getByRole('heading', { name: 'Barrios', level: 1 }),
    ).toBeVisible();
    await expect(contextSelector(page)).toContainText('Plataforma');
    await expect(contextSelector(page)).toContainText('Super-admin');
    const navigation = page
      .getByRole('navigation', { name: 'Navegación principal' })
      .filter({ visible: true });
    await expect(
      navigation.getByRole('link', { name: 'Barrios' }),
    ).toBeVisible();
    await expect(
      navigation.getByRole('link', { name: 'Soporte' }),
    ).toBeVisible();
    await expect(navigation.getByRole('link')).toHaveCount(2);
    await navigation.getByRole('link', { name: 'Soporte' }).click();
    await expect(
      page.getByRole('heading', { name: 'Soporte', level: 1 }),
    ).toBeVisible();

    // The tenant area is not where a platform admin works: "/" leads back to the platform.
    await page.goto('/');
    await expect(page).toHaveURL(/\/platform\/tenants$/);

    // --- new session: password alone is not enough --------------------------------------------------------
    await logout(page);
    await signIn(page, admin.email, admin.password);
    await expect(page).toHaveURL(/\/login\/mfa/);
    await page.goto('/platform/support');
    await expect(page).toHaveURL(/\/login\/mfa\?next=%2Fplatform%2Fsupport$/);
    await answerChallenge(page, totpCode(secret, 1));
    await expect(page).toHaveURL(/\/platform\/support$/);
    await expect(
      page.getByRole('heading', { name: 'Soporte', level: 1 }),
    ).toBeVisible();
  });

  test('a tenant user cannot reach the platform area, and is not offered it', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.adminCeibos);
    await page.goto('/platform/tenants');
    await expect(page).toHaveURL(/\/$/);
    await expect(contextSelector(page)).not.toContainText('Plataforma');

    const response = await page.goto('/platform/support');
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/$/);
  });

  test('a visitor is sent to the login form with the return path', async ({
    page,
  }) => {
    await page.goto('/platform/tenants');
    await expect(page).toHaveURL(/\/login\?next=%2Fplatform%2Ftenants$/);
  });
});
