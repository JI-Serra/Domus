import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD } from './support/accounts';
import {
  clearMailbox,
  extractAuthLink,
  waitForEmailText,
} from './support/mailpit';
import { createDisposableUser } from './support/supabase';
import {
  contextSelector,
  expectNoHorizontalOverflow,
  formAlert,
  loginWithPassword,
  logout,
  submitLogin,
} from './support/flows';

test.describe('login and logout', () => {
  test('signs in with email and password and keeps the session across reloads', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.adminCeibos);
    await expect(page).toHaveURL(/\/$/);
    await expect(contextSelector(page)).toContainText('Barrio Los Ceibos');
    await expect(contextSelector(page)).toContainText('Administrador');

    await page.reload();
    await expect(page).toHaveURL(/\/$/);
    await expect(contextSelector(page)).toContainText('Barrio Los Ceibos');
  });

  test('a wrong password shows an es-AR error and stays on the form', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.adminCeibos);
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('esta-no-es-la-clave');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(formAlert(page)).toContainText(
      'El email o la contraseña no coinciden. Revisalos y volvé a intentar.',
    );
    await expect(page).toHaveURL(/\/ingresar$/);
    // What the user typed (except the password) is kept.
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(
      ACCOUNTS.adminCeibos,
    );
  });

  test('field validation errors are in es-AR and tied to the field', async ({
    page,
  }) => {
    await page.goto('/ingresar');
    await page.getByLabel('Email', { exact: true }).fill('no-es-un-email');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(
      page.getByText('Revisá el email: tiene que ser como nombre@dominio.com.'),
    ).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  test('logout ends the session', async ({ page }) => {
    await loginWithPassword(page, ACCOUNTS.guardTipas);
    await logout(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/ingresar$/);
  });

  test('the login page has no horizontal overflow', async ({ page }) => {
    await page.goto('/ingresar');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('route protection', () => {
  test('a protected route redirects to login and returns after signing in', async ({
    page,
  }) => {
    await page.goto('/access');
    await expect(page).toHaveURL(/\/ingresar\?next=%2Faccess$/);

    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.holderCeibos);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(page).toHaveURL(/\/access$/);
    await expect(contextSelector(page)).toBeVisible();
  });

  test('a hostile return path is ignored', async ({ page }) => {
    await page.goto('/ingresar?next=https%3A%2F%2Fevil.example%2F');
    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.holderCeibos);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(contextSelector(page)).toBeVisible();
    expect(new URL(page.url()).hostname).toBe(
      new URL(test.info().project.use.baseURL ?? page.url()).hostname,
    );
  });

  test('public routes stay reachable without a session', async ({
    page,
    request,
  }) => {
    await page.goto('/design');
    await expect(page).toHaveURL(/\/design$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sistema de diseño' }),
    ).toBeVisible();
    // The debug route keeps its own rules (answers 404 in production builds, 500 in dev), never a login redirect.
    const debug = await request.get('/api/debug/error', { maxRedirects: 0 });
    expect([404, 500]).toContain(debug.status());
  });

  test('a signed-in user is sent away from the login page', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.holderCeibos);
    await page.goto('/ingresar');
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('magic link', () => {
  test('signs in from the email sent to the local mail catcher', async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto('/ingresar');
    await page.getByText('Con enlace por email').click();
    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.holderCeibos);
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByRole('status')).toContainText('Revisá tu email');

    const link = extractAuthLink(await waitForEmailText(ACCOUNTS.holderCeibos));
    await page.goto(link);
    await expect(page).toHaveURL(/\/$/);
    await expect(contextSelector(page)).toContainText('Barrio Los Ceibos');
    await expect(contextSelector(page)).toContainText('Titular');
  });

  test('answers the same for an email without an account', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByText('Con enlace por email').click();
    await page
      .getByLabel('Email', { exact: true })
      .fill('nadie.registrado@domus.local');
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    await expect(page.getByRole('status')).toContainText('Revisá tu email');
    await expect(page.getByRole('status')).toContainText(
      'Si nadie.registrado@domus.local tiene una cuenta',
    );
  });

  test('an already used link shows an expired-link message', async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto('/ingresar');
    await page.getByText('Con enlace por email').click();
    await page.getByLabel('Email', { exact: true }).fill(ACCOUNTS.guardTipas);
    await page.getByRole('button', { name: 'Enviarme el enlace' }).click();
    const link = extractAuthLink(await waitForEmailText(ACCOUNTS.guardTipas));

    await page.goto(link);
    await expect(contextSelector(page)).toBeVisible();
    await logout(page);

    await page.goto(link);
    await expect(page).toHaveURL(/\/ingresar/);
    await expect(formAlert(page)).toContainText(
      'El enlace venció o ya se usó.',
    );
  });
});

test.describe('password recovery', () => {
  test('request, email link, new password, then sign in with it', async ({
    page,
  }) => {
    const user = await createDisposableUser();
    const newPassword = 'ClaveNueva456!';
    await clearMailbox();

    await page.goto('/ingresar');
    await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toContainText('Revisá tu email');

    const link = extractAuthLink(await waitForEmailText(user.email));
    await page.goto(link);
    await expect(page).toHaveURL(/\/restablecer$/);
    await expect(
      page.getByRole('heading', { name: 'Elegí una contraseña nueva' }),
    ).toBeVisible();

    await page
      .getByLabel('Contraseña nueva', { exact: true })
      .fill(newPassword);
    await page.getByLabel('Repetí la contraseña nueva').fill('otra-distinta-1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(
      page.getByText('Las contraseñas no coinciden. Escribilas de nuevo.'),
    ).toBeVisible();

    await page
      .getByLabel('Contraseña nueva', { exact: true })
      .fill(newPassword);
    await page.getByLabel('Repetí la contraseña nueva').fill(newPassword);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    // The account has no barrio yet, so the user lands on the empty state, signed in.
    await expect(
      page.getByRole('heading', {
        name: 'Todavía no tenés un barrio asignado',
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);

    // The old password no longer works; the new one does.
    await page.getByLabel('Email', { exact: true }).fill(user.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(formAlert(page)).toContainText(
      'El email o la contraseña no coinciden.',
    );
    await page.getByLabel('Contraseña', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'Todavía no tenés un barrio asignado',
      }),
    ).toBeVisible();
  });

  test('does not reveal whether the email has an account', async ({ page }) => {
    await page.goto('/recuperar');
    await page
      .getByLabel('Email', { exact: true })
      .fill('nadie.registrado@domus.local');
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Si nadie.registrado@domus.local tiene una cuenta',
    );
  });

  test('opening the reset page without a recovery session explains the expired link', async ({
    page,
  }) => {
    await page.goto('/restablecer');
    await expect(formAlert(page)).toContainText('El enlace venció');
    await page.getByRole('link', { name: 'Pedir un enlace nuevo' }).click();
    await expect(page).toHaveURL(/\/recuperar$/);
  });
});

test.describe('no memberships', () => {
  test('shows the empty state with a way out', async ({ page }) => {
    const user = await createDisposableUser();
    await submitLogin(page, user.email, user.password);
    await expect(
      page.getByRole('heading', {
        name: 'Todavía no tenés un barrio asignado',
      }),
    ).toBeVisible();
    await expect(page.getByText('Cuando la administración')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/ingresar$/);
  });
});
