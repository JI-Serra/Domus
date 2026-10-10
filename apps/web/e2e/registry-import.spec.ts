import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';
import { cleanUp, countUnits, unitUpdateStamps } from './support/database';
import { expectNoHorizontalOverflow, loginWithPassword } from './support/flows';
import {
  createRegistryAdmin,
  openRegistrySection,
  uniqueSuffix,
} from './support/registry';
import type { RegistryAdmin } from './support/registry';

const FIXTURE = path.resolve(
  process.cwd(),
  '../../supabase/fixtures/registry-demo-150.csv',
);
const HEADER =
  'unit_code,unit_block_code,unit_lot_number,unit_status,unit_coefficient,person_first_name,person_last_name,person_document_type,person_document_number,person_email,unit_resident_relationship,unit_resident_is_holder,unit_resident_is_minor';

// Staging and confirming hundreds of rows is database work, not a render: give it room.
const LONG = 60_000;

const csv = (...lines: string[]) => ({
  name: 'archivo.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from([HEADER, ...lines].join('\r\n')),
});

test.describe.serial('bulk import (M02-F02)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let suffix: string;
  let page: Page;
  const fileInput = () => page.locator('input[type="file"]');
  const stat = (testId: string) => page.getByTestId(testId);

  test.beforeAll(async ({ browser }, testInfo) => {
    suffix = uniqueSuffix(testInfo);
    admin = await createRegistryAdmin(`Barrio Importar ${suffix}`);
    const context = await browser.newContext({
      ...testInfo.project.use,
      locale: 'es-AR',
      acceptDownloads: true,
    });
    page = await context.newPage();
    await loginWithPassword(page, admin.email);
    await openRegistrySection(page, 'Importar');
  });

  test.afterAll(async () => {
    await page?.context().close();
    await cleanUp({ tenantIds: [admin.tenantId], emails: [admin.email] });
  });

  test('offers the CSV and XLSX templates, and the page has a localized file picker', async () => {
    await expect(
      page.getByRole('button', { name: 'Elegir archivo' }),
    ).toBeVisible();
    await expect(page.getByText('Sin archivo', { exact: true })).toBeVisible();

    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Plantilla CSV' }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toBe('domus-padron-plantilla.csv');
    const template = readFileSync((await csvDownload.path()) ?? '', 'utf8');
    expect(template).toContain('unit_code,unit_block_code,unit_lot_number');

    const [xlsxDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Plantilla XLSX' }).click(),
    ]);
    expect(xlsxDownload.suggestedFilename()).toBe(
      'domus-padron-plantilla.xlsx',
    );
    // The template is itself a valid import: it previews without errors.
    // (Playwright stores downloads under a bare id, so the file is handed over with its real name.)
    await fileInput().setInputFiles({
      name: xlsxDownload.suggestedFilename(),
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: readFileSync((await xlsxDownload.path()) ?? ''),
    });
    await expect(stat('import-rows')).toHaveText('1');
    await expect(stat('import-errors')).toHaveText('0');
    await expectNoHorizontalOverflow(page);
  });

  test('reports problems with the file and with rows, row by row', async () => {
    await page.goto('/registry/import');

    await fileInput().setInputFiles({
      name: 'notas.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hola'),
    });
    await expect(
      page.getByText('Solo se pueden importar archivos .csv o .xlsx.'),
    ).toBeVisible();

    await fileInput().setInputFiles({
      name: 'sin-codigo.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('unit_status,unit_coefficient\r\nvacant,1'),
    });
    await expect(
      page.getByText('Falta la columna obligatoria: unit_code.'),
    ).toBeVisible();

    await fileInput().setInputFiles(
      csv(
        'OK-1,1,1,vacant,1,,,,,,,,',
        'MAL-2,1,2,vacant,abc,,,,,,,,',
        'MAL-3,1,3,occupied,1,Ana,,dni,111,,owner,true,false',
      ),
    );
    await expect(stat('import-rows')).toHaveText('3');
    await expect(stat('import-errors')).toHaveText('2');
    const table = page.getByRole('table', { name: 'Filas del archivo' });
    await expect(table).toContainText(
      'El coeficiente tiene que ser un número mayor que 0.',
    );
    await expect(table).toContainText('Falta el apellido.');
    // The line is the one in the spreadsheet (header = 1).
    await expect(table.getByRole('row', { name: /MAL-2/ })).toContainText('3');
    await expect(page.getByRole('button', { name: 'Validar' })).toHaveCount(0);

    // Only the database can see these: the same unit with different data in two rows.
    await fileInput().setInputFiles(
      csv('DUP-1,1,1,vacant,1,,,,,,,,', 'DUP-1,2,1,vacant,1,,,,,,,,'),
    );
    await expect(stat('import-errors')).toHaveText('0');
    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(
      page.getByRole('heading', { name: 'Validación del servidor' }),
    ).toBeVisible();
    await expect(stat('import-errors')).toHaveText('2');
    await expect(
      page.getByRole('table', { name: 'Filas con errores' }),
    ).toContainText('La unidad aparece con datos distintos en varias filas.');
    await expect(
      page.getByRole('button', { name: 'Confirmar importación' }),
    ).toHaveCount(0);
    expect(await countUnits(admin.tenantId)).toBe(0);
  });

  test('reads an XLSX file in the browser', async () => {
    await page.goto('/registry/import');
    const buffer = await writeXlsxFile([
      ['unit_code', 'unit_status', 'unit_coefficient'].map((value) => ({
        value,
      })),
      [{ value: `XL-${suffix}` }, { value: 'Vacía' }, { value: 1.25 }],
    ]).toBuffer();
    await fileInput().setInputFiles({
      name: 'unidades.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    await expect(stat('import-rows')).toHaveText('1');
    await expect(stat('import-errors')).toHaveText('0');
    await expect(
      page.getByRole('table', { name: 'Filas del archivo' }),
    ).toContainText(`XL-${suffix}`);
  });

  test('imports the 150-unit fixture, and importing it again changes nothing', async () => {
    await page.goto('/registry/import');
    await fileInput().setInputFiles(FIXTURE);
    await expect(stat('import-rows')).toHaveText('450');
    await expect(stat('import-units')).toHaveText('150');
    await expect(stat('import-residents')).toHaveText('450');
    await expect(stat('import-errors')).toHaveText('0');
    await expect(page.getByText('Mostrando 100 de 450.')).toBeVisible();

    await page.getByRole('button', { name: 'Validar' }).click();
    await expect(page.getByText('Todo está listo para importar.')).toBeVisible({
      timeout: LONG,
    });
    await page.getByRole('button', { name: 'Confirmar importación' }).click();

    await expect(page.getByTestId('import-outcome')).toHaveText(
      'Importación completa.',
      { timeout: LONG },
    );
    await expect(stat('result-units')).toHaveText('150');
    await expect(stat('result-created-units')).toHaveText('150');
    await expect(stat('result-created-residents')).toHaveText('450');
    expect(await countUnits(admin.tenantId)).toBe(150);
    const stamps = await unitUpdateStamps(admin.tenantId);

    await page.getByRole('link', { name: 'Ver unidades' }).click();
    await expect(page.getByTestId('billable-count')).toHaveText('150');
    await expect(page.getByText('Página 1 de 6')).toBeVisible();

    // The same file again: valid, confirmed, and nothing changed.
    await openRegistrySection(page, 'Importar');
    await fileInput().setInputFiles(FIXTURE);
    await expect(stat('import-errors')).toHaveText('0');
    await page.getByRole('button', { name: 'Validar' }).click();
    await page
      .getByRole('button', { name: 'Confirmar importación' })
      .click({ timeout: LONG });
    await expect(page.getByTestId('import-outcome')).toHaveText(
      'Sin cambios: los datos ya estaban cargados.',
      { timeout: LONG },
    );
    await expect(stat('result-created-units')).toHaveText('0');
    await expect(stat('result-created-residents')).toHaveText('0');
    expect(await countUnits(admin.tenantId)).toBe(150);
    expect(await unitUpdateStamps(admin.tenantId)).toBe(stamps);
    await expectNoHorizontalOverflow(page);
  });
});
