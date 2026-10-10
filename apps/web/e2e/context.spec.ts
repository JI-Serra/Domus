import { expect, test } from '@playwright/test';
import { ACCOUNTS, TENANT_IDS, TENANT_NAMES } from './support/accounts';
import { contextSelector, loginWithPassword } from './support/flows';
import { signedInClient } from './support/supabase';

const CONTEXT_COOKIE = 'domus-context';

test.describe('active context', () => {
  test('a user with two barrios starts in the first by name and can switch', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.shared);
    // "Barrio Las Tipas" sorts before "Barrio Los Ceibos".
    await expect(contextSelector(page)).toContainText(TENANT_NAMES.tipas);
    await expect(
      page.getByRole('heading', { name: 'Tu contexto activo' }),
    ).toBeVisible();

    await contextSelector(page).click();
    const options = page.getByRole('group', { name: 'Cambiar de contexto' });
    await expect(options.getByRole('button')).toHaveCount(2);
    await options
      .getByRole('button', { name: new RegExp(TENANT_NAMES.ceibos) })
      .click();

    await expect(contextSelector(page)).toContainText(TENANT_NAMES.ceibos);
    await expect(page.getByRole('main')).toContainText(TENANT_NAMES.ceibos);

    // The server action persists the choice in a cookie; once it is stored the choice survives a reload.
    await expect
      .poll(async () =>
        (await page.context().cookies()).some(
          (entry) => entry.name === CONTEXT_COOKIE,
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(contextSelector(page)).toContainText(TENANT_NAMES.ceibos);
    const cookie = (await page.context().cookies()).find(
      (entry) => entry.name === CONTEXT_COOKIE,
    );
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
  });

  test('a forged or foreign context cookie falls back to the default', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.shared);
    const url = new URL(page.url());

    // Not a membership at all.
    await page.context().addCookies([
      {
        name: CONTEXT_COOKIE,
        value: 'forged-membership-id',
        url: url.origin,
      },
    ]);
    await page.reload();
    await expect(contextSelector(page)).toContainText(TENANT_NAMES.tipas);

    // The platform context needs an aal2 platform admin session.
    await page
      .context()
      .addCookies([
        { name: CONTEXT_COOKIE, value: 'platform', url: url.origin },
      ]);
    await page.reload();
    await expect(contextSelector(page)).toContainText(TENANT_NAMES.tipas);
    await expect(contextSelector(page)).not.toContainText('Plataforma');
  });

  test("another user's membership id in the cookie is ignored", async ({
    page,
  }) => {
    // The Ceibos admin's membership id, read through that admin's own RLS-scoped session...
    const adminClient = await signedInClient(ACCOUNTS.adminCeibos);
    const { data } = await adminClient
      .from('membership')
      .select('membership_id, person!inner(user_id)')
      .eq('membership_role', 'tenant_admin')
      .limit(1);
    const adminMembershipId = data?.[0]?.membership_id as string | undefined;
    expect(adminMembershipId).toBeTruthy();

    // ...replayed from a different user's browser.
    await loginWithPassword(page, ACCOUNTS.shared);
    await page.context().addCookies([
      {
        name: CONTEXT_COOKIE,
        value: adminMembershipId ?? '',
        url: new URL(page.url()).origin,
      },
    ]);
    await page.reload();
    await expect(contextSelector(page)).toContainText(TENANT_NAMES.tipas);
    await expect(contextSelector(page)).not.toContainText('Administrador');
  });

  test('a single-membership user sees the context without a switcher', async ({
    page,
  }) => {
    await loginWithPassword(page, ACCOUNTS.guardTipas);
    await expect(
      page.getByRole('group', { name: 'Contexto activo' }),
    ).toContainText(`${TENANT_NAMES.tipas}`);
    await expect(
      page.getByRole('group', { name: 'Contexto activo' }),
    ).toContainText('Guardia');
    await expect(
      page.getByRole('button', { name: /^Contexto activo:/ }),
    ).toHaveCount(0);
  });
});

test.describe('tenant isolation (demo)', () => {
  test('a tenant A user querying tenant B rows gets nothing', async () => {
    const client = await signedInClient(ACCOUNTS.adminCeibos);

    // Sanity: the user does see their own tenant.
    const own = await client.from('tenant').select('tenant_id, tenant_name');
    expect(own.error).toBeNull();
    expect(own.data).toEqual([
      { tenant_id: TENANT_IDS.ceibos, tenant_name: TENANT_NAMES.ceibos },
    ]);

    // Tenant B (Las Tipas): every tenant-scoped table comes back empty, no matter how it is asked for.
    for (const table of [
      'tenant',
      'person',
      'membership',
      'membership_permission',
    ]) {
      const result = await client
        .from(table)
        .select('*')
        .eq('tenant_id', TENANT_IDS.tipas);
      expect(result.error, table).toBeNull();
      expect(result.data, table).toEqual([]);
    }

    // And writing into it is refused.
    const write = await client
      .from('person')
      .update({ person_first_name: 'Intruso' })
      .eq('tenant_id', TENANT_IDS.tipas)
      .select();
    expect(write.data ?? []).toEqual([]);
  });

  test('a barrio user cannot read platform administrators', async () => {
    const client = await signedInClient(ACCOUNTS.shared);
    const result = await client.from('platform_admin').select('*');
    expect(result.data ?? []).toEqual([]);
  });
});
