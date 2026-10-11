import { expect, test } from '@playwright/test';
import {
  cleanUp,
  createTenant,
  makePlatformAdmin,
  withDatabase,
} from './support/database';
import { enrollTotp, signIn } from './support/flows';
import { createDisposableUser } from './support/supabase';
import { uniqueSuffix } from './support/registry';

test.describe('billable unit count in the platform (M01-F03, D20)', () => {
  test.setTimeout(120_000);

  test('the barrio detail shows the count and follows the billing criteria and unit overrides', async ({
    page,
  }, testInfo) => {
    const suffix = uniqueSuffix(testInfo);
    const { tenantId } = await createTenant(`Barrio Conteo ${suffix}`);
    const platformAdmin = await createDisposableUser();
    await makePlatformAdmin(platformAdmin.userId);
    try {
      // Units straight into the local database: three counted by criteria, one archived, one overridden.
      await withDatabase(async (db) => {
        await db.query(
          `insert into public.unit (tenant_id, unit_code, unit_status, unit_is_billable, unit_archived_at)
           values ($1, 'C-1', 'vacant', null, null),
                  ($1, 'C-2', 'under_construction', null, null),
                  ($1, 'C-3', 'vacant', true, null),
                  ($1, 'C-4', 'vacant', null, now()),
                  ($1, 'C-5', 'vacant', false, null)`,
          [tenantId],
        );
      });

      await signIn(page, platformAdmin.email, platformAdmin.password);
      await page.goto('/platform');
      await enrollTotp(page);
      await expect(page).toHaveURL(/\/platform\/tenants$/);

      await page.goto(`/platform/tenants/${tenantId}`);
      const count = page.getByTestId('billable-count');
      // Default criteria bill every state: C-1, C-2 and the overridden C-3 (C-4 is archived, C-5 opted out).
      await expect(count).toHaveText('3');

      // Billing only "En obra": C-3 stays (its own override), C-1 leaves, C-2 stays.
      await page
        .getByRole('switch', { name: 'Vacía' })
        .uncheck({ force: true });
      await page
        .getByRole('switch', { name: 'Ocupada' })
        .uncheck({ force: true });
      await page.getByRole('button', { name: 'Guardar criterios' }).click();
      await expect(page.getByText('Cambios guardados.')).toBeVisible();
      await page.reload();
      await expect(page.getByTestId('billable-count')).toHaveText('2');

      // The placeholder of H1 is gone.
      await expect(page.getByText(/disponible en H2/)).toHaveCount(0);
    } finally {
      await cleanUp({ tenantIds: [tenantId], emails: [platformAdmin.email] });
    }
  });
});
