import { expect, test } from '@playwright/test';

test.describe('/design', () => {
  test('the gate-mode switch toggles from its visible track, its text and the keyboard', async ({
    page,
  }) => {
    await page.goto('/design');
    const html = page.locator('html');
    const toggle = page.getByRole('switch', { name: 'Modo garita' });
    const label = page.locator('label').filter({ has: toggle });
    // The visible control is the track; the input itself is visually hidden.
    const track = label.locator('span[aria-hidden="true"]');

    await expect(html).not.toHaveAttribute('data-mode', 'gate');
    await expect(toggle).not.toBeChecked();

    await track.click();
    await expect(html).toHaveAttribute('data-mode', 'gate');
    await expect(toggle).toBeChecked();

    await label.getByText('Modo garita').click();
    await expect(html).not.toHaveAttribute('data-mode', 'gate');
    await expect(toggle).not.toBeChecked();

    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(html).toHaveAttribute('data-mode', 'gate');
    await expect(toggle).toBeChecked();
    await page.keyboard.press('Space');
    await expect(html).not.toHaveAttribute('data-mode', 'gate');

    // The choice survives a reload.
    await track.click();
    await page.reload();
    await expect(html).toHaveAttribute('data-mode', 'gate');
    await expect(
      page.getByRole('switch', { name: 'Modo garita' }),
    ).toBeChecked();
  });

  test('an info button opens its help on click and closes on Escape and outside click', async ({
    page,
  }) => {
    await page.goto('/design');
    const button = page.getByRole('button', {
      name: 'Más información sobre esta página',
    });
    const box = await button.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    const help = page.getByRole('group', {
      name: 'Más información sobre esta página',
    });
    await expect(help).toBeHidden();
    await button.click();
    await expect(help).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect(button).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(help).toBeVisible();
    await page.getByRole('heading', { name: 'Sistema de diseño' }).click();
    await expect(help).toBeHidden();
  });
});
