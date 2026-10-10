import { expect, test } from '@playwright/test';
import {
  addMembership,
  createTenant,
  makePlatformAdmin,
} from './support/database';
import {
  answerChallenge,
  enrollTotp,
  expectNoHorizontalOverflow,
  formAlert,
  logout,
  signIn,
} from './support/flows';
import { createDisposableUser } from './support/supabase';
import { totpCode, wrongCode } from './support/totp';

/** Reads the enrollment page's QR/manual key flow without finishing it. */
async function startEnrollment(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Activar verificación' }).click();
  const key = page.getByRole('textbox', { name: 'Clave manual' });
  await expect(key).toBeVisible();
  return key.inputValue();
}

test.describe('MFA enrollment (M01-F05)', () => {
  test('enrolls an authenticator app with a generated code, then every login asks for it', async ({
    page,
  }) => {
    const user = await createDisposableUser();

    // --- enroll ---------------------------------------------------------------------------------------------
    await signIn(page, user.email, user.password);
    await page.goto('/account/security');
    await expect(
      page.getByRole('heading', { name: 'Seguridad', level: 1 }),
    ).toBeVisible();
    await expect(page.getByText('Desactivada')).toBeVisible();
    await expect(page.getByText('Todavía no agregaste ninguno.')).toBeVisible();

    await page.getByRole('button', { name: 'Activar verificación' }).click();
    await expect(
      page.getByRole('img', {
        name: 'Código QR para agregar Domus a tu app de autenticación',
      }),
    ).toBeVisible();
    const secret = await page
      .getByRole('textbox', { name: 'Clave manual' })
      .inputValue();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    await expectNoHorizontalOverflow(page);

    // A wrong code keeps the flow open with an es-AR error.
    await page.getByLabel('Código de 6 dígitos').fill(wrongCode(secret));
    await page.getByRole('button', { name: 'Verificar y activar' }).click();
    await expect(
      page.getByText(/El código no es correcto o ya venció/),
    ).toBeVisible();
    await expect(page.getByLabel('Código de 6 dígitos')).toBeVisible();

    // A malformed one is caught before asking the auth server.
    await page.getByLabel('Código de 6 dígitos').fill('12');
    await page.getByRole('button', { name: 'Verificar y activar' }).click();
    await expect(
      page.getByText(
        'Escribí los 6 dígitos que muestra tu app de autenticación.',
      ),
    ).toBeVisible();

    await page.getByLabel('Código de 6 dígitos').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Verificar y activar' }).click();
    await expect(
      page.getByText('Verificación en dos pasos activada.'),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText('Activada', { exact: true })).toBeVisible();
    await expect(
      page.getByText(/^Agregado el \d{2}\/\d{2}\/\d{4}$/),
    ).toBeVisible();

    // --- next login: challenge -----------------------------------------------------------------------------
    await logout(page);
    await signIn(page, user.email, user.password);
    await expect(page).toHaveURL(/\/login\/mfa/);
    await expect(
      page.getByRole('heading', { name: 'Ingresá el código', level: 1 }),
    ).toBeVisible();

    // The app stays closed at aal1: any route leads back to the challenge, keeping where it was going.
    await page.goto('/account/security');
    await expect(page).toHaveURL(/\/login\/mfa\?next=%2Faccount%2Fsecurity/);

    await answerChallenge(page, wrongCode(secret));
    await expect(
      page.getByText(/El código no es correcto o ya venció/),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login\/mfa/);

    await answerChallenge(page, totpCode(secret, 1));
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText('Activada', { exact: true })).toBeVisible();

    // --- removing needs aal2 (we are at aal2 now) ----------------------------------------------------------
    await page.getByRole('button', { name: 'Quitar' }).click();
    await page
      .getByRole('group', { name: '¿Quitar este método?' })
      .getByRole('button', { name: 'Quitar' })
      .click();
    await expect(page.getByText('Todavía no agregaste ninguno.')).toBeVisible();
    await expect(page.getByText('Desactivada')).toBeVisible();

    // Without a factor the login is a plain one again.
    await logout(page);
    await signIn(page, user.email, user.password);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('an unfinished enrollment is discarded and can be restarted', async ({
    page,
  }) => {
    const user = await createDisposableUser();
    await signIn(page, user.email, user.password);
    await page.goto('/account/security');

    await startEnrollment(page);
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(
      page.getByRole('button', { name: 'Activar verificación' }),
    ).toBeVisible();

    // Leaving without cancelling must not block the next attempt either.
    await startEnrollment(page);
    await page.goto('/account/security');
    const secret = await startEnrollment(page);
    await page.getByLabel('Código de 6 dígitos').fill(totpCode(secret));
    await page.getByRole('button', { name: 'Verificar y activar' }).click();
    await expect(
      page.getByText('Verificación en dos pasos activada.'),
    ).toBeVisible();
  });

  test('a password-only session of a user with a factor is stuck at the challenge', async ({
    page,
    browser,
  }) => {
    const user = await createDisposableUser();
    await signIn(page, user.email, user.password);
    await page.goto('/account/security');
    await enrollTotp(page);
    await expect(
      page.getByText('Verificación en dos pasos activada.'),
    ).toBeVisible();

    // A second browser signs in with the password only: stuck at the challenge, nothing else reachable.
    const other = await browser.newContext({
      baseURL: page.url().split('/account')[0] ?? '',
    });
    const second = await other.newPage();
    await signIn(second, user.email, user.password);
    await expect(second).toHaveURL(/\/login\/mfa/);
    await second.goto('/account/security');
    await expect(second).toHaveURL(/\/login\/mfa/);
    await other.close();
  });

  test('tenant admins get a dismissible recommendation on the security page only', async ({
    page,
  }) => {
    const user = await createDisposableUser();
    const { tenantId, tenantName } = await createTenant(
      `Barrio E2E ${Date.now()}`,
    );
    await addMembership(user.userId, tenantId, 'tenant_admin');

    await signIn(page, user.email, user.password);
    await expect(page.getByRole('main')).toBeVisible();
    // No nagging anywhere else.
    await expect(
      page.getByText('Protegé tu cuenta de administrador'),
    ).toHaveCount(0);

    await page.goto('/account/security');
    await expect(page.getByRole('banner')).toContainText(tenantName);
    const recommendation = page.getByRole('region', {
      name: /Protegé tu cuenta de administrador/,
    });
    await expect(recommendation).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole('button', { name: 'Descartar recomendación' }).click();
    await expect(recommendation).toHaveCount(0);
    await page.reload();
    await expect(recommendation).toHaveCount(0);

    // A platform admin is not nagged either way, and a plain resident never sees the recommendation.
    const resident = await createDisposableUser();
    await addMembership(resident.userId, tenantId, 'unit_holder');
    await page.context().clearCookies();
    await signIn(page, resident.email, resident.password);
    await page.goto('/account/security');
    await expect(
      page.getByRole('heading', { name: 'Seguridad', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText('Protegé tu cuenta de administrador'),
    ).toHaveCount(0);
  });

  test('an invalid or unsafe return path is ignored after enrolling', async ({
    page,
  }) => {
    const user = await createDisposableUser();
    await makePlatformAdmin(user.userId);
    await signIn(page, user.email, user.password);
    await page.goto('/account/security?next=https://evil.example/phish');
    await enrollTotp(page);
    // The unsafe path is dropped: the user stays on the security page, which now shows the factor. (A platform
    // admin gets the platform shell around it once the session reaches aal2, so the page is checked by state.)
    await expect(page.getByText('Activada', { exact: true })).toBeVisible();
    // Same origin, same page: nothing sent the browser to the other site.
    expect(new URL(page.url()).hostname).toBe('127.0.0.1');
    expect(new URL(page.url()).pathname).toBe('/account/security');
    await expect(formAlert(page)).toHaveCount(0);
  });
});
