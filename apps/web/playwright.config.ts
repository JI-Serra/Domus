import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Local runs read the same public variables as the app; CI exports them from `supabase status`.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

// 127.0.0.1 is the Supabase `site_url`, so auth emails link back to the same origin the tests use.
const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// `E2E_DEV=1` runs against `next dev`; the default is the production build (`pnpm build` first).
const SERVER_COMMAND = process.env.E2E_DEV
  ? `pnpm exec next dev -p ${PORT} -H 127.0.0.1`
  : `pnpm exec next start -p ${PORT} -H 127.0.0.1`;

export default defineConfig({
  testDir: './e2e',
  // The tests share one local Supabase stack and one mail catcher, so they run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Tucuman',
    colorScheme: 'light',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop-1440',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-360',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 740 },
      },
    },
  ],
  webServer: {
    command: SERVER_COMMAND,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
