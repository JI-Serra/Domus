import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
import { PASSWORD } from './accounts';
import { totpCode } from './totp';

/** Fills and submits the real login form. */
export async function submitLogin(
  page: Page,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
}

/** Signs in through the real form and waits until the app shell is showing. */
export async function loginWithPassword(
  page: Page,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await submitLogin(page, email, password);
  await expect(contextSelector(page)).toBeVisible();
}

/** The always-visible active context in the top bar (a button when the user has several contexts). */
export function contextSelector(page: Page) {
  return page
    .getByRole('button', { name: /^Contexto activo:/ })
    .or(page.getByRole('group', { name: 'Contexto activo' }));
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Asserts the page has no horizontal overflow at the current viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** The form-level error message (Next's route announcer is also a `role="alert"` element, so exclude it). */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/**
 * Runs the enrollment on /account/security: starts it, reads the manual key the page shows, types the first code
 * and verifies. Returns the key, which is all a test needs to produce later codes.
 */
export async function enrollTotp(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Activar verificación' }).click();
  const key = page.getByRole('textbox', { name: 'Clave manual' });
  await expect(key).toBeVisible();
  const secret = await key.inputValue();
  await page.getByLabel('Código de 6 dígitos').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verificar y activar' }).click();
  return secret;
}

/** Types a code into the challenge page and submits it. */
export async function answerChallenge(page: Page, code: string): Promise<void> {
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button', { name: 'Verificar', exact: true }).click();
}

/**
 * Signs in through the real form and waits until the browser has left /login (to the app, to the MFA challenge or
 * wherever the proxy sends it). Use it for accounts that may have no shell to wait for.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await submitLogin(page, email, password);
  await page.waitForURL((url) => url.pathname !== '/login');
}

/** A fresh browser context (its own cookies) with the same device settings as the project under test. */
export async function newContext(
  browser: Browser,
  testInfo: TestInfo,
  colorScheme: 'light' | 'dark' = 'light',
): Promise<BrowserContext> {
  const { baseURL, viewport, isMobile, hasTouch, userAgent } =
    testInfo.project.use;
  return browser.newContext({
    baseURL,
    viewport,
    isMobile,
    hasTouch,
    userAgent,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Tucuman',
    colorScheme,
  });
}

/** 1x1 transparent PNG: a real, valid image for logo uploads. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
