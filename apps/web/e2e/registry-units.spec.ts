import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cleanUp } from './support/database';
import {
  expectNoHorizontalOverflow,
  formAlert,
  loginWithPassword,
} from './support/flows';
import {
  createRegistryAdmin,
  openRegistrySection,
  uniqueSuffix,
} from './support/registry';
import type { RegistryAdmin } from './support/registry';

test.describe
  .serial('units, residents, 360 sheet and search (M02-F01/F03/F08)', () => {
  test.setTimeout(120_000);

  let admin: RegistryAdmin;
  let suffix: string;
  let page: Page;

  test.beforeAll(async ({ browser }, testInfo) => {
    suffix = uniqueSuffix(testInfo);
    admin = await createRegistryAdmin(`Barrio Unidades ${suffix}`);
    const context = await browser.newContext({
      ...testInfo.project.use,
      locale: 'es-AR',
    });
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
  });

  test.afterAll(async () => {
    await page?.context().close();
    await cleanUp({ tenantIds: [admin.tenantId], emails: [admin.email] });
  });

  test('creates, edits and archives a unit; archived units leave the list', async () => {
    const code = `E2E-V-${suffix}`;
    await openRegistrySection(page, 'Unidades');
    await expect(page.getByTestId('billable-count')).toHaveText('0');

    await page.getByRole('link', { name: 'Nueva unidad' }).click();
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByLabel('Manzana', { exact: true }).fill('7');
    await page.getByLabel('Lote', { exact: true }).fill('3');
    await page.getByRole('button', { name: 'Crear unidad' }).click();

    // The sheet of the new unit.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Vacía',
    );
    await expectNoHorizontalOverflow(page);

    // Validation errors are words, not codes.
    await page.getByRole('link', { name: 'Editar', exact: true }).click();
    await page.getByLabel('Código', { exact: true }).fill('');
    await page.getByLabel('Coeficiente', { exact: true }).fill('abc');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      page.getByText('Escribí el código de la unidad.'),
    ).toBeVisible();
    await expect(
      page.getByText('El coeficiente tiene que ser un número mayor que 0.'),
    ).toBeVisible();

    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByLabel('Coeficiente', { exact: true }).fill('1,5');
    await page.getByLabel('Facturable', { exact: true }).selectOption('yes');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(code);
    await expect(page.getByText('1.5', { exact: true })).toBeVisible();

    // It shows in the list and counts as billable.
    await openRegistrySection(page, 'Unidades');
    await expect(page.getByRole('link', { name: code })).toBeVisible();
    await expect(page.getByTestId('billable-count')).toHaveText('1');
    await page.getByLabel('Buscar', { exact: true }).fill('E2E-V');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('link', { name: code })).toBeVisible();

    // The same code cannot be used twice.
    await page.getByRole('link', { name: 'Nueva unidad' }).click();
    await page.getByLabel('Código', { exact: true }).fill(code.toLowerCase());
    await page.getByRole('button', { name: 'Crear unidad' }).click();
    await expect(formAlert(page)).toContainText(
      'Ya hay una unidad con ese código.',
    );

    // Archive with a confirmation that says what happens.
    await page.goto('/registry/units');
    await page.getByRole('link', { name: code }).click();
    await page.getByRole('button', { name: 'Archivar', exact: true }).click();
    const dialog = page.getByRole('dialog', {
      name: `¿Archivar la unidad ${code}?`,
    });
    await expect(dialog).toContainText('Se conserva su historial.');
    await dialog.getByRole('button', { name: 'Archivar unidad' }).click();
    await expect(page).toHaveURL(/\/registry\/units$/);
    await expect(page.getByRole('link', { name: code })).toHaveCount(0);
    await expect(page.getByTestId('billable-count')).toHaveText('0');

    await page.getByLabel('Archivadas').check({ force: true });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page.getByRole('link', { name: code })).toBeVisible();
    await expect(page.getByText('Archivada', { exact: true })).toBeVisible();
  });

  test('adds residents, enforces the holder rule with clear errors, and keeps minors out of invitations', async () => {
    const code = `E2E-R-${suffix}`;
    await page.goto('/registry/units/new');
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByLabel('Estado', { exact: true }).selectOption('occupied');

    // An occupied unit is created with its first holder; without one the form says so.
    await page.getByRole('button', { name: 'Crear unidad' }).click();
    await expect(page.getByText('Escribí el nombre.')).toBeVisible();
    await page.getByLabel('Nombre', { exact: true }).fill('Tomás');
    await page.getByLabel('Apellido', { exact: true }).fill('Titular');
    await page
      .getByLabel('Número', { exact: true })
      .fill(`3${suffix}`.slice(0, 8));
    await page
      .getByLabel('Email', { exact: true })
      .fill(`titular.${suffix}@ejemplo.test`);
    await page.getByRole('button', { name: 'Crear unidad' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(code);

    const residents = page.getByRole('list', {
      name: 'Habitantes de la unidad',
    });
    await expect(residents).toContainText('Tomás Titular');
    await expect(residents).toContainText('Titular');

    // The only holder cannot leave while the unit is occupied.
    await page
      .getByRole('button', { name: 'Finalizar la residencia de Tomás Titular' })
      .click();
    await page.getByRole('button', { name: 'Finalizar residencia' }).click();
    await expect(formAlert(page)).toContainText(
      'Una unidad ocupada necesita al menos un titular adulto vigente',
    );
    await expect(residents).toContainText('Tomás Titular');

    // A minor: marked, never offered an invitation.
    await page.getByRole('button', { name: 'Agregar habitante' }).click();
    const sheet = page.getByRole('dialog', { name: 'Agregar habitante' });
    await sheet.getByLabel('Nombre', { exact: true }).fill('Mica');
    await sheet.getByLabel('Apellido', { exact: true }).fill('Titular');
    await sheet
      .getByLabel('Número', { exact: true })
      .fill(`4${suffix}`.slice(0, 8));
    await sheet
      .getByLabel('Email', { exact: true })
      .fill(`mica.${suffix}@ejemplo.test`);
    await sheet
      .getByRole('switch', { name: 'Menor de edad' })
      .check({ force: true });
    await sheet
      .getByRole('switch', { name: 'Titular', exact: true })
      .check({ force: true });
    await sheet.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(
      sheet.getByText('Un titular tiene que ser una persona adulta.'),
    ).toBeVisible();
    await sheet
      .getByRole('switch', { name: 'Titular', exact: true })
      .uncheck({ force: true });
    await sheet.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(residents).toContainText('Mica Titular');
    await expect(residents.getByText('Menor', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Invitar a Mica Titular' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Invitar a Tomás Titular' }),
    ).toBeVisible();

    // A second adult holder lets the first one leave.
    await page.getByRole('button', { name: 'Agregar habitante' }).click();
    const second = page.getByRole('dialog', { name: 'Agregar habitante' });
    await second.getByLabel('Nombre', { exact: true }).fill('Sofía');
    await second.getByLabel('Apellido', { exact: true }).fill('Segunda');
    await second
      .getByLabel('Número', { exact: true })
      .fill(`5${suffix}`.slice(0, 8));
    await second
      .getByRole('switch', { name: 'Titular', exact: true })
      .check({ force: true });
    await second.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(residents).toContainText('Sofía Segunda');

    // Demoting the holder who stays is refused the same way, demoting the other is fine.
    await page
      .getByRole('button', { name: 'Finalizar la residencia de Tomás Titular' })
      .click();
    await page.getByRole('button', { name: 'Finalizar residencia' }).click();
    await expect(page.getByText('Residencia finalizada.')).toBeVisible();
    await expect(residents).not.toContainText('Tomás Titular');
    await expect(page.getByText('Residencias finalizadas (1)')).toBeVisible();

    await page.getByRole('button', { name: 'Editar a Sofía Segunda' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar habitante' });
    await edit
      .getByRole('switch', { name: 'Titular', exact: true })
      .uncheck({ force: true });
    await edit.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(
      edit.getByText(/Una unidad ocupada necesita al menos un titular/),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('global search finds units, people, plates and emails, with the keyboard', async () => {
    const code = `E2E-S-${suffix}`;
    await page.goto('/registry/units/new');
    await page.getByLabel('Código', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Crear unidad' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(code);

    // A vehicle to find by plate.
    await page
      .getByRole('button', { name: 'Agregar', exact: true })
      .first()
      .click();
    const vehicle = page.getByRole('dialog', { name: 'Agregar vehículo' });
    await vehicle.getByLabel('Patente').fill('zz 987 yy');
    await vehicle.getByLabel('Marca').fill('Fiat');
    await vehicle.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(page.getByText('ZZ987YY')).toBeVisible();

    const search = page.getByRole('combobox', { name: 'Buscar en el padrón' });
    const results = page.getByRole('listbox', { name: 'Buscar en el padrón' });

    // Warm the route (the first request in a dev server compiles it), then time a real search.
    await search.fill('E2E');
    await expect(results.getByRole('option').first()).toBeVisible();
    await search.fill('');
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/registry/search')),
      search.fill(code),
    ]);
    expect(response.ok()).toBe(true);
    const timing = response.request().timing();
    expect(timing.responseEnd).toBeLessThan(300);
    await expect(results.getByRole('option').first()).toContainText(code);

    // By plate, with the keyboard: arrow to the option, Enter opens the unit sheet.
    await page.goto('/registry/units');
    await search.fill('zz987');
    await expect(results.getByRole('option')).toHaveCount(1);
    await expect(results.getByRole('option').first()).toContainText('Vehículo');
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(page).toHaveURL(/\/registry\/units\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(code);

    // By person name, and nothing for a stranger.
    await search.fill('Sofía');
    await expect(results.getByRole('option').first()).toContainText('Persona');
    await search.fill('nadie-con-este-nombre');
    await expect(results).toContainText('Sin resultados');
    await search.press('Escape');
    await expect(results).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });
});
