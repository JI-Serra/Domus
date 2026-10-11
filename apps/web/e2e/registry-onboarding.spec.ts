import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { cleanUp } from './support/database';
import {
  contextSelector,
  formAlert,
  loginWithPassword,
  newContext,
} from './support/flows';
import { extractAuthLink, waitForEmailTextSince } from './support/mailpit';
import { createRegistryAdmin, uniqueSuffix } from './support/registry';
import type { RegistryAdmin } from './support/registry';
import { openAuthLink } from './support/auth-links';
import { createDisposableUser, signedInClient } from './support/supabase';

test.describe
  .serial('resident invitations, one-time links and join requests (M02-F04, D22)', () => {
  test.setTimeout(180_000);

  let admin: RegistryAdmin;
  let suffix: string;
  let page: Page;
  let unitCode: string;
  const emails: string[] = [];
  const contexts: BrowserContext[] = [];
  const holderEmail = () => `e2e.holder.${suffix}@domus.local`;

  const residents = () =>
    page.getByRole('list', { name: 'Habitantes de la unidad' });
  const invitations = () =>
    page.getByRole('region', { name: 'Invitaciones pendientes' });

  test.beforeAll(async ({ browser }, testInfo) => {
    suffix = uniqueSuffix(testInfo);
    unitCode = `E2E-O-${suffix}`;
    admin = await createRegistryAdmin(`Barrio Onboarding ${suffix}`);
    emails.push(admin.email, holderEmail());
    const context = await browser.newContext({
      ...testInfo.project.use,
      locale: 'es-AR',
    });
    contexts.push(context);
    page = await context.newPage();
    await loginWithPassword(page, admin.email);

    await page.goto('/registry/units/new');
    await page.getByLabel('Código', { exact: true }).fill(unitCode);
    await page.getByLabel('Estado', { exact: true }).selectOption('occupied');
    await page.getByLabel('Nombre', { exact: true }).fill('Hugo');
    await page.getByLabel('Apellido', { exact: true }).fill('Habitante');
    await page
      .getByLabel('Número', { exact: true })
      .fill(`7${suffix}`.slice(0, 8));
    await page.getByLabel('Email', { exact: true }).fill(holderEmail());
    await page.getByRole('button', { name: 'Crear unidad' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      unitCode,
    );
  });

  test.afterAll(async () => {
    for (const context of contexts) await context.close();
    await cleanUp({ tenantIds: [admin.tenantId], emails: emails });
  });

  test('invites a resident by email; the email link ends in the right membership', async ({
    browser,
  }, testInfo) => {
    const since = new Date(Date.now() - 2000);
    await page
      .getByRole('button', { name: 'Invitar a Hugo Habitante' })
      .click();
    const sheet = page.getByRole('dialog', {
      name: 'Invitar a abrir una cuenta',
    });
    await expect(sheet.getByLabel('Email', { exact: true })).toHaveValue(
      holderEmail(),
    );
    await expect(sheet.getByLabel('Rol', { exact: true })).toHaveValue(
      'unit_holder',
    );
    await sheet.getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(sheet).toBeHidden();
    await expect(invitations()).toContainText(holderEmail());
    await expect(invitations()).toContainText('Titular');

    const invitee = await newContext(browser, testInfo);
    contexts.push(invitee);
    const inviteePage = await invitee.newPage();
    await openAuthLink(
      inviteePage,
      extractAuthLink(await waitForEmailTextSince(holderEmail(), since)),
    );
    await expect(inviteePage).toHaveURL(
      /\/invitations\/accept\?token=[a-f0-9]{64}$/,
    );
    await expect(
      inviteePage.getByText(admin.tenantName, { exact: true }),
    ).toBeVisible();
    await expect(
      inviteePage.getByText('Titular', { exact: true }),
    ).toBeVisible();
    await inviteePage
      .getByRole('button', { name: 'Aceptar invitación' })
      .click();
    await expect(inviteePage).toHaveURL(/\/(home)?$/);
    await expect(contextSelector(inviteePage)).toContainText(admin.tenantName);
    await expect(contextSelector(inviteePage)).toContainText('Titular');

    // The administrator now sees the account on the unit, and no pending invitation.
    await page.reload();
    await expect(residents().getByText('Con cuenta')).toBeVisible();
    await expect(invitations()).toContainText(
      'No hay invitaciones pendientes.',
    );
    await expect(
      page.getByRole('list', { name: 'Cuentas' }).getByText('Hugo Habitante'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Invitar a Hugo Habitante' }),
    ).toHaveCount(0);
  });

  test('hands over a one-time link, shown once, that the invited person accepts', async ({
    browser,
  }, testInfo) => {
    const member = await createDisposableUser();
    emails.push(member.email);

    await page.getByRole('button', { name: 'Agregar habitante' }).click();
    const add = page.getByRole('dialog', { name: 'Agregar habitante' });
    await add.getByLabel('Nombre', { exact: true }).fill('Lía');
    await add.getByLabel('Apellido', { exact: true }).fill('Miembra');
    await add
      .getByLabel('Número', { exact: true })
      .fill(`8${suffix}`.slice(0, 8));
    await add.getByLabel('Email', { exact: true }).fill(member.email);
    await add.getByRole('button', { name: 'Agregar', exact: true }).click();
    await expect(residents()).toContainText('Lía Miembra');

    await page.getByRole('button', { name: 'Invitar a Lía Miembra' }).click();
    const sheet = page.getByRole('dialog', {
      name: 'Invitar a abrir una cuenta',
    });
    await sheet
      .getByLabel('Rol', { exact: true })
      .selectOption('household_member');
    await sheet
      .getByText('Enlace de un solo uso', { exact: true })
      .first()
      .click();
    await sheet.getByRole('button', { name: 'Generar enlace' }).click();
    const link = sheet.getByTestId('one-time-secret');
    await expect(link).toContainText('/invitations/accept?token=');
    const href = (await link.textContent()) ?? '';
    expect(href).toMatch(/\/invitations\/accept\?token=[a-f0-9]{64}$/);
    await sheet.getByRole('button', { name: 'Listo' }).click();
    // Gone from the screen: it cannot be read back.
    await expect(page.getByText(/token=/)).toHaveCount(0);
    await expect(invitations()).toContainText(member.email);

    // The invited person opens it signed out: they prove the mailbox with an email link, then confirm.
    const context = await newContext(browser, testInfo);
    contexts.push(context);
    const memberPage = await context.newPage();
    await memberPage.goto(new URL(href).pathname + new URL(href).search);
    await memberPage
      .getByRole('link', { name: 'Ingresar', exact: true })
      .click();
    await expect(memberPage).toHaveURL(/\/login\?next=/);
    const since = new Date(Date.now() - 2000);
    await memberPage.getByLabel('Con enlace por email').check({ force: true });
    await memberPage.getByLabel('Email', { exact: true }).fill(member.email);
    await memberPage
      .getByRole('button', { name: 'Enviarme el enlace' })
      .click();
    await expect(memberPage.getByText('Revisá tu email')).toBeVisible();
    await openAuthLink(
      memberPage,
      extractAuthLink(await waitForEmailTextSince(member.email, since)),
    );
    await expect(memberPage).toHaveURL(
      /\/invitations\/accept\?token=[a-f0-9]{64}/,
    );
    await expect(
      memberPage.getByText(admin.tenantName, { exact: true }),
    ).toBeVisible();
    await expect(
      memberPage.getByText('Miembro del hogar', { exact: true }),
    ).toBeVisible();
    await memberPage
      .getByRole('button', { name: 'Aceptar invitación' })
      .click();
    await expect(contextSelector(memberPage)).toContainText(
      'Miembro del hogar',
    );

    // The link works once.
    await memberPage.goto(new URL(href).pathname + new URL(href).search);
    await expect(
      memberPage.getByText('Esta invitación no está disponible', {
        exact: true,
      }),
    ).toBeVisible();
  });

  test('a unit join code only asks: the request is approved or rejected by a person', async ({
    browser,
  }, testInfo) => {
    const approved = await createDisposableUser();
    const rejected = await createDisposableUser();
    emails.push(approved.email, rejected.email);

    await page.getByRole('button', { name: 'Código de la unidad' }).click();
    const confirm = page.getByRole('dialog', {
      name: '¿Generar un código nuevo?',
    });
    await expect(confirm).toContainText(
      'El código anterior deja de funcionar.',
    );
    await confirm.getByRole('button', { name: 'Generar código' }).click();
    const secret = page.getByTestId('one-time-secret');
    await expect(secret).toHaveText(
      /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
    );
    const code = (await secret.textContent()) ?? '';
    await page.getByRole('button', { name: 'Ocultar' }).click();
    await expect(page.getByTestId('one-time-secret')).toHaveCount(0);

    for (const [user, first] of [
      [approved, 'Ana'],
      [rejected, 'Raúl'],
    ] as const) {
      const client = await signedInClient(user.email);
      const { data, error } = await client.rpc('submit_unit_join_request', {
        target_tenant_id: admin.tenantId,
        join_code: code,
        person_data: {
          person_first_name: first,
          person_last_name: 'Solicitante',
        },
        client_event_id: crypto.randomUUID(),
      });
      expect(error).toBeNull();
      expect((data as { status: string }).status).toBe('pending');
    }

    // Nobody got in by themselves.
    await page.reload();
    const requests = page.getByRole('region', {
      name: 'Solicitudes de ingreso',
    });
    await expect(requests).toContainText('Ana Solicitante');
    await expect(requests).toContainText('Raúl Solicitante');
    await expect(page.getByRole('list', { name: 'Cuentas' })).not.toContainText(
      'Solicitante',
    );

    await page
      .getByRole('button', { name: 'Rechazar a Raúl Solicitante' })
      .click();
    await expect(page.getByText('Solicitud rechazada.')).toBeVisible();
    await expect(requests).not.toContainText('Raúl Solicitante');

    const since = new Date(Date.now() - 2000);
    await page
      .getByRole('button', { name: 'Aprobar a Ana Solicitante' })
      .click();
    await expect(
      page.getByText('Solicitud aprobada. Enviamos la invitación por email.'),
    ).toBeVisible();
    await expect(requests).not.toContainText('Ana Solicitante');
    await expect(residents()).toContainText('Ana Solicitante');
    await expect(invitations()).toContainText(approved.email);

    // The approval sends the invitation; accepting it is what creates the membership.
    const context = await newContext(browser, testInfo);
    contexts.push(context);
    const applicant = await context.newPage();
    await openAuthLink(
      applicant,
      extractAuthLink(await waitForEmailTextSince(approved.email, since)),
    );
    await expect(applicant).toHaveURL(
      /\/invitations\/accept\?token=[a-f0-9]{64}$/,
    );
    await applicant.getByRole('button', { name: 'Aceptar invitación' }).click();
    await expect(contextSelector(applicant)).toContainText('Miembro del hogar');

    await page.reload();
    await expect(page.getByRole('list', { name: 'Cuentas' })).toContainText(
      'Ana Solicitante',
    );
    // Errors are words: a stale request is simply gone.
    await expect(formAlert(page)).toHaveCount(0);
  });
});
