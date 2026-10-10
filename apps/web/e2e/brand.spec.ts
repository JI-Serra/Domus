import { expect, test } from '@playwright/test';
import { ACCOUNTS } from './support/accounts';
import { loginWithPassword } from './support/flows';

test.describe('brand (M00-F02)', () => {
  test('the login page shows the Domus logo, named "Domus", with real size and geometry', async ({
    page,
  }) => {
    await page.goto('/login');
    const logo = page.getByRole('img', { name: 'Domus' });
    await expect(logo).toBeVisible();
    const box = await logo.boundingBox();
    // The wordmark is wide (emblem + "omus"): about 3.8 times as wide as tall.
    expect(box?.height ?? 0).toBeGreaterThan(24);
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeGreaterThan(3.5);
    // It paints with the text color, so it follows light and dark.
    await expect(logo).toHaveAttribute('fill', 'currentColor');
    expect(await logo.locator('path').getAttribute('d')).toMatch(/^M/);
  });

  test('the logo follows the theme: dark ink on light, light ink on dark', async ({
    page,
  }) => {
    const ink = () =>
      page.getByRole('img', { name: 'Domus' }).evaluate((node) => {
        const color = getComputedStyle(node).color;
        const [r = 0, g = 0, b = 0] = (color.match(/\d+/g) ?? []).map(Number);
        return (r + g + b) / 3;
      });
    await page.goto('/login');
    expect(await ink()).toBeLessThan(80);

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    expect(await ink()).toBeGreaterThan(180);
  });

  test('the signed-in shell carries the brand: logo in the sidebar from 1024 px, emblem in the top bar below', async ({
    page,
  }, testInfo) => {
    await loginWithPassword(page, ACCOUNTS.adminCeibos);
    const marks = page
      .getByRole('img', { name: 'Domus' })
      .filter({ visible: true });
    await expect(marks).toHaveCount(1);
    const box = await marks.first().boundingBox();
    const wide = (box?.width ?? 0) / (box?.height ?? 1);
    if (testInfo.project.name === 'mobile-360') {
      expect(wide).toBeLessThan(1.3); // emblem
      await expect(
        page.getByRole('banner').getByRole('img', { name: 'Domus' }),
      ).toBeVisible();
    } else {
      expect(wide).toBeGreaterThan(3.5); // logo
      await expect(
        page.getByRole('complementary').getByRole('img', { name: 'Domus' }),
      ).toBeVisible();
    }
  });

  test('/design has a Marca section with emblem, logo and icons', async ({
    page,
  }) => {
    await page.goto('/design#brand');
    const section = page.getByRole('region', { name: 'Marca' });
    await expect(section).toBeVisible();
    await expect(
      section.getByRole('img', { name: 'Domus' }).first(),
    ).toBeVisible();
    for (const name of [
      'Ícono de la app',
      'Ícono adaptable',
      'Ícono de Apple',
    ]) {
      const icon = section.getByRole('img', { name });
      await expect(icon).toBeVisible();
      expect(
        await icon.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0);
    }
  });

  test('favicon, apple icon and a valid manifest are served to visitors', async ({
    page,
    request,
  }) => {
    await page.goto('/login');
    const hrefs = await page
      .locator(
        'link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
      )
      .evaluateAll((links) =>
        links.map((link) => ({
          rel: link.getAttribute('rel'),
          href: link.getAttribute('href'),
          type: link.getAttribute('type'),
        })),
      );
    expect(
      hrefs.some(
        (l) => l.rel?.includes('icon') && l.href?.includes('icon.svg'),
      ),
    ).toBe(true);
    expect(hrefs.some((l) => l.rel === 'apple-touch-icon')).toBe(true);
    expect(hrefs.some((l) => l.rel === 'manifest')).toBe(true);

    for (const link of hrefs) {
      const response = await request.get(link.href ?? '');
      expect(response.status(), link.href ?? '').toBe(200);
    }
    const ico = await request.get('/favicon.ico');
    expect(ico.status()).toBe(200);

    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest.name).toBe('Domus');
    const icons = manifest.icons as {
      src: string;
      sizes: string;
      purpose?: string;
    }[];
    expect(icons.map((i) => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('the brand SVG files are served as images and keep the emblem geometry', async ({
    request,
  }) => {
    for (const file of [
      'domus-emblem.svg',
      'domus-logo.svg',
      'domus-emblem-light.svg',
      'domus-logo-light.svg',
    ]) {
      const response = await request.get(`/brand/${file}`);
      expect(response.status(), file).toBe(200);
      expect(response.headers()['content-type']).toContain('image/svg+xml');
      expect(await response.text()).toContain('M22.924.2');
    }
  });
});
