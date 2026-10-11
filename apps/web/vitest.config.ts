import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    // The machine is shared with other workers and the e2e stack: a render must not fail on a slow moment.
    testTimeout: 15_000,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright specs live in e2e/ and run with `pnpm test:e2e`.
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
