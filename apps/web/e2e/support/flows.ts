import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PASSWORD } from './accounts';

/** Fills and submits the real login form. */
export async function submitLogin(
  page: Page,
  email: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto('/ingresar');
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
  await expect(page).toHaveURL(/\/ingresar$/);
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
