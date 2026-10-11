import type { Page } from '@playwright/test';

/**
 * Opens a link from an auth email (invitation, magic link, recovery) on the origin the test runs against.
 *
 * The Edge Functions and the Auth allow-list build these links for the app at `http://127.0.0.1:3000` (the stack's
 * `site_url`), so a run on another port (`E2E_PORT`, used when several agents share the local stack) would end up on
 * the wrong server. The Auth redirect is therefore read instead of followed, and its path, query and fragment (the
 * session or the error) are replayed on the page's own origin. On port 3000 this is the same place the browser would
 * have ended up.
 */
export async function openAuthLink(page: Page, link: string): Promise<void> {
  const response = await fetch(link, { redirect: 'manual' });
  const location = response.headers.get('location');
  if (!location)
    throw new Error(`The auth link did not redirect (${response.status})`);
  const target = new URL(location, link);
  await page.goto(`${target.pathname}${target.search}${target.hash}`);
}
