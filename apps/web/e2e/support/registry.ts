import { expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { addMembership, createTenant, grantPermission } from './database';
import { createDisposableUser } from './supabase';

export interface RegistryAdmin {
  tenantId: string;
  tenantName: string;
  email: string;
  userId: string;
}

/**
 * A fresh barrio with its own administrator (a disposable account holding the given administrative permissions), so
 * a spec never touches the seeded barrios and cleans up everything it created with `cleanUp`.
 */
export async function createRegistryAdmin(
  label: string,
  permissions: readonly string[] = ['registry', 'guards'],
): Promise<RegistryAdmin> {
  const tenant = await createTenant(label, 'active');
  const user = await createDisposableUser();
  await addMembership(user.userId, tenant.tenantId, 'tenant_admin', {
    first: 'Alma',
    last: 'Administradora',
  });
  for (const permission of permissions)
    await grantPermission(user.userId, tenant.tenantId, permission);
  return { ...tenant, email: user.email, userId: user.userId };
}

export const isMobile = (testInfo: TestInfo) =>
  testInfo.project.name === 'mobile-360';

/** Short unique suffix per project and run, so two projects never collide on a code or an email. */
export const uniqueSuffix = (testInfo: TestInfo) =>
  `${testInfo.project.name.replace(/\D/g, '')}${`${Date.now()}`.slice(-7)}`;

/**
 * Opens a Padrón destination the way a person does: the sidebar entry from 1024 px; below that the "Padrón" tab,
 * then the strip of links at the top of the area.
 */
export async function openRegistrySection(
  page: Page,
  label: 'Unidades' | 'Importar' | 'Guardias' | 'Puestos' | 'Verificación',
): Promise<void> {
  const link = page.getByRole('link', { name: label, exact: true });
  if (!(await link.first().isVisible())) {
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Padrón', exact: true })
      .click();
    await page.waitForURL(/\/registry\//);
  }
  await link.first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}
