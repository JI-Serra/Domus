import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { ACCOUNTS } from './support/accounts';
import { cleanUp } from './support/database';
import {
  expectNoHorizontalOverflow,
  loginWithPassword,
  newContext,
} from './support/flows';
import { createRegistryAdmin, uniqueSuffix } from './support/registry';
import type { RegistryAdmin } from './support/registry';
import { signedInClient } from './support/supabase';

// Seeded administrators that are not in ACCOUNTS: Las Tipas (all permissions) and a Los Ceibos registry-only one.
const ADMIN_TIPAS = 'admin.tipas@domus.local';
const ADMIN_REGISTRY_ONLY = 'registry.ceibos@domus.local';
const CEIBOS = '10000000-0000-0000-0000-000000000001';

const POLICY_PATH = '/settings/access-policy';
const row = (page: Page, name: string) =>
  page.getByRole('group', { name, exact: true });
const saveButton = (page: Page) =>
  page.getByRole('button', { name: 'Guardar cambios' });

/** Signs a seeded account in a context of its own and opens the policy page. */
async function openPolicyAs(
  contexts: BrowserContext[],
  newPage: () => Promise<Page>,
  email: string,
): Promise<Page> {
  const page = await newPage();
  contexts.push(page.context());
  await loginWithPassword(page, email);
  await page.goto(POLICY_PATH);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Reglamento de accesos',
  );
  return page;
}

test.describe.serial('access policy (M03)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let page: Page;
  const contexts: BrowserContext[] = [];
  const emails: string[] = [];

  test.beforeAll(async ({ browser }, testInfo) => {
    // A barrio of its own: the specs that change the policy never touch the seeded ones.
    admin = await createRegistryAdmin(
      `Barrio Reglamento ${uniqueSuffix(testInfo)}`,
      ['access_config', 'registry'],
    );
    emails.push(admin.email);
    const context = await newContext(browser, testInfo);
    contexts.push(context);
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    try {
      if (admin) {
        const client = await signedInClient(admin.email);
        const restored = await client.rpc('apply_access_policy_template', {
          target_tenant_id: admin.tenantId,
          template: 'balanced',
          client_event_id: randomUUID(),
        });
        expect(restored.error).toBeNull();
      }
    } finally {
      for (const context of contexts) await context.close();
      await cleanUp({ tenantIds: admin ? [admin.tenantId] : [], emails });
    }
  });

  test('shows the seeded policies: Los Ceibos is Equilibrado, Las Tipas is Estricto', async ({
    browser,
  }, testInfo) => {
    const newPage = async () => (await newContext(browser, testInfo)).newPage();

    const ceibos = await openPolicyAs(contexts, newPage, ACCOUNTS.adminCeibos);
    await expect(ceibos.getByText('Aplicada: Equilibrado')).toBeVisible();
    await expect(
      ceibos.getByLabel('Tiempo de espera de aprobación'),
    ).toHaveValue('90');
    const delivery = row(ceibos, 'Delivery');
    await expect(
      delivery.getByRole('checkbox', { name: 'Aprobación' }),
    ).toBeChecked();
    await expect(
      delivery.getByRole('checkbox', { name: 'Ingreso directo' }),
    ).not.toBeChecked();
    await expect(
      delivery.getByRole('combobox', { name: 'Por defecto' }),
    ).toHaveValue('approval');
    await expectNoHorizontalOverflow(ceibos);

    const tipas = await openPolicyAs(contexts, newPage, ADMIN_TIPAS);
    await expect(tipas.getByText('Aplicada: Estricto')).toBeVisible();
    await expect(
      tipas.getByLabel('Tiempo de espera de aprobación'),
    ).toHaveValue('120');
    await expect(tipas.getByLabel('Usos máximos de un pase')).toHaveValue('3');
    await expect(
      row(tipas, 'Delivery').getByRole('checkbox', { name: 'Aviso' }),
    ).not.toBeChecked();
    await expect(
      row(tipas, 'Autorizado permanente').getByRole('switch', {
        name: 'Verificar identidad',
      }),
    ).toBeChecked();
    await expectNoHorizontalOverflow(tipas);
  });

  test('the settings page leads administrators with access_config to the policy', async () => {
    await page.goto('/settings');
    await page.getByRole('link', { name: 'Reglamento de accesos' }).click();
    await expect(page).toHaveURL(/\/settings\/access-policy$/);
    await expect(page.getByText('Aplicada: Equilibrado')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('changes the default and the allowed modes, and keeps them after reloading', async () => {
    await page.goto(POLICY_PATH);
    await expect(saveButton(page)).toBeDisabled();

    const delivery = row(page, 'Delivery');
    // Touch targets: 44 px at least, at both widths.
    for (const control of [
      delivery.getByRole('checkbox', { name: 'Aviso' }).locator('xpath=..'),
      delivery.getByRole('combobox', { name: 'Por defecto' }),
    ]) {
      const box = await control.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }

    await delivery.getByRole('checkbox', { name: 'Ingreso directo' }).check();
    await delivery
      .getByRole('combobox', { name: 'Por defecto' })
      .selectOption('notify');
    await expect(page.getByText('Hay cambios sin guardar')).toBeVisible();
    await saveButton(page).click();
    await expect(page.getByText('Reglamento guardado.')).toBeVisible();
    await expect(page.getByText('Personalizado')).toBeVisible();

    await page.reload();
    const saved = row(page, 'Delivery');
    await expect(
      saved.getByRole('checkbox', { name: 'Ingreso directo' }),
    ).toBeChecked();
    await expect(
      saved.getByRole('combobox', { name: 'Por defecto' }),
    ).toHaveValue('notify');
    await expect(page.getByText('Personalizado')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('blocks an invalid policy in the interface and in the database', async () => {
    await page.goto(POLICY_PATH);
    // An unknown visitor never gets direct entry or notice: the boxes are off, and an info button says why.
    const unknown = row(page, 'Desconocido');
    await expect(
      unknown.getByRole('checkbox', { name: 'Ingreso directo' }),
    ).toBeDisabled();
    await expect(
      unknown.getByRole('checkbox', { name: 'Aviso' }),
    ).toBeDisabled();
    await unknown
      .getByRole('button', {
        name: 'Por qué un desconocido no admite ingreso directo ni aviso',
      })
      .click();
    await expect(
      unknown.getByText(/nunca entra sin que el hogar lo apruebe/),
    ).toBeVisible();
    await page.keyboard.press('Escape');

    // Limits outside the bounds cannot be saved.
    const timeout = page.getByLabel('Tiempo de espera de aprobación');
    await timeout.fill('301');
    await expect(
      page.getByText('Ingresá un número entero entre 30 y 300.'),
    ).toBeVisible();
    await expect(saveButton(page)).toBeDisabled();
    await timeout.fill('29');
    await expect(saveButton(page)).toBeDisabled();
    await timeout.fill('120');
    await expect(saveButton(page)).toBeEnabled();
    await page.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(timeout).toHaveValue('90');
    await expect(saveButton(page)).toBeDisabled();

    // The database says no even to a client that skips the interface.
    const client = await signedInClient(admin.email);
    const current = await client.rpc('get_access_policy', {
      target_tenant_id: admin.tenantId,
    });
    expect(current.error).toBeNull();
    const policy = structuredClone(current.data.policy);
    policy.rules.unknown.access_policy_rule_allowed_modes = [
      'direct_entry',
      'approval',
    ];
    const refused = await client.rpc('update_access_policy', {
      target_tenant_id: admin.tenantId,
      policy,
      client_event_id: randomUUID(),
    });
    expect(refused.error?.code).toBe('22023');
  });

  test('applies Flexible after reviewing the diff, and can back out of the preview', async () => {
    await page.goto(POLICY_PATH);
    await page
      .getByRole('button', { name: 'Ver los cambios de la plantilla Flexible' })
      .click();
    const sheet = page.getByRole('dialog', { name: 'Plantilla Flexible' });
    const changes = sheet.getByRole('list', {
      name: 'Cambios de la plantilla',
    });
    await expect(changes).toContainText('Tiempo de espera de aprobación');
    await expect(changes).toContainText('90 s');
    await expect(changes).toContainText('60 s');
    await expect(changes).toContainText('Invitado con pase · Por defecto');
    // However long the diff is, the confirmation stays within reach.
    await expect(
      sheet.getByRole('button', { name: 'Aplicar plantilla' }),
    ).toBeInViewport();
    await expectNoHorizontalOverflow(page);

    // Backing out saves nothing.
    await sheet.getByRole('button', { name: 'Cancelar' }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Personalizado')).toBeVisible();
    await expect(page.getByLabel('Tiempo de espera de aprobación')).toHaveValue(
      '90',
    );

    await page
      .getByRole('button', { name: 'Ver los cambios de la plantilla Flexible' })
      .click();
    await sheet.getByRole('button', { name: 'Aplicar plantilla' }).click();
    await expect(page.getByText('Plantilla aplicada.')).toBeVisible();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('Aplicada: Flexible')).toBeVisible();
    await expect(page.getByLabel('Tiempo de espera de aprobación')).toHaveValue(
      '60',
    );
    await expect(
      row(page, 'Delivery').getByRole('combobox', { name: 'Por defecto' }),
    ).toHaveValue('notify');
  });

  test('the history shows who, when, template or manual, and before → after', async () => {
    await page.goto(POLICY_PATH);
    await page.getByRole('link', { name: 'Historial' }).click();
    await expect(page).toHaveURL(/\/settings\/access-policy\/history$/);
    const entries = page
      .getByRole('list', { name: 'Cambios del reglamento' })
      .locator('> li');
    await expect(entries).toHaveCount(2);

    // Newest first: the template, then the manual edit.
    const template = entries.nth(0);
    await expect(template).toContainText('Plantilla Flexible');
    await expect(template).toContainText('Alma Administradora');
    await expect(template).toContainText('Tiempo de espera de aprobación');
    await expect(template).toContainText('90 s');
    await expect(template).toContainText('60 s');
    await expect(template).toContainText(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);

    const manual = entries.nth(1);
    await expect(manual).toContainText('Manual');
    await expect(manual).toContainText('Alma Administradora');
    await expect(manual).toContainText('Delivery · Por defecto');
    await expect(manual).toContainText('Aprobación');
    await expect(manual).toContainText('Aviso');
    await expect(manual).toContainText('Delivery · Modos permitidos');
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: 'Reglamento', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/access-policy$/);
  });

  test('an administrator without access_config sees the policy read-only and cannot change it', async ({
    browser,
  }, testInfo) => {
    const newPage = async () => (await newContext(browser, testInfo)).newPage();
    const registryOnly = await openPolicyAs(
      contexts,
      newPage,
      ADMIN_REGISTRY_ONLY,
    );
    await expect(registryOnly.getByText('Solo lectura')).toBeVisible();
    await expect(
      registryOnly.getByLabel('Tiempo de espera de aprobación'),
    ).toBeDisabled();
    for (const box of await registryOnly.getByRole('checkbox').all())
      await expect(box).toBeDisabled();
    for (const select of await registryOnly
      .getByRole('list', { name: 'Reglas por tipo de visitante' })
      .getByRole('combobox')
      .all())
      await expect(select).toBeDisabled();
    await expect(
      registryOnly.getByRole('button', { name: 'Guardar cambios' }),
    ).toHaveCount(0);
    await expect(
      registryOnly.getByRole('button', {
        name: /Ver los cambios de la plantilla/,
      }),
    ).toHaveCount(0);
    await expect(
      registryOnly.getByRole('link', { name: 'Historial' }),
    ).toHaveCount(0);
    // No settings entry, and the history is not even confirmed to exist.
    await registryOnly.goto('/settings');
    await expect(
      registryOnly.getByRole('link', { name: 'Reglamento de accesos' }),
    ).toHaveCount(0);
    expect((await registryOnly.goto(`${POLICY_PATH}/history`))?.status()).toBe(
      404,
    );

    // The database refuses them as well (re-applying the template Los Ceibos already has would change nothing).
    const client = await signedInClient(ADMIN_REGISTRY_ONLY);
    const applied = await client.rpc('apply_access_policy_template', {
      target_tenant_id: CEIBOS,
      template: 'balanced',
      client_event_id: randomUUID(),
    });
    expect(applied.error?.code).toBe('42501');
    const history = await client.rpc('access_policy_history', {
      target_tenant_id: CEIBOS,
    });
    expect(history.error?.code).toBe('42501');
  });
});
