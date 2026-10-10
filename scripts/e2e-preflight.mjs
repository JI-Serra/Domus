// Fails loudly when the services the e2e suite needs (Storage, Edge Functions, mail catcher) are not reachable,
// so a missing service is never mistaken for a flaky or skipped test. Used by Playwright's globalSetup and by CI
// (`node scripts/e2e-preflight.mjs --wait` waits for `supabase functions serve` to come up).
import { fileURLToPath } from 'node:url';

const API_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const FUNCTIONS = ['send-invitation', 'support-session'];

async function status(url, init) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(5000), ...init }))
      .status;
  } catch {
    return 0;
  }
}

/** Returns a list of human-readable problems; empty when everything is reachable. */
export async function findProblems() {
  const problems = [];
  if ((await status(`${MAILPIT_URL}/api/v1/info`)) !== 200) {
    problems.push(`Mail catcher not reachable at ${MAILPIT_URL}`);
  }
  // Storage answers 200 on /status without credentials when the container is up.
  if ((await status(`${API_URL}/storage/v1/status`)) !== 200) {
    problems.push(`Storage API not reachable at ${API_URL}/storage/v1`);
  }
  for (const name of FUNCTIONS) {
    // An unauthenticated POST reaches the function and is rejected by it (4xx); 404/5xx/no answer means it is not served.
    const code = await status(`${API_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (code === 0 || code === 404 || code >= 500) {
      problems.push(
        `Edge Function "${name}" is not being served (HTTP ${code || 'no response'})`,
      );
    }
  }
  return problems;
}

export default async function globalSetup() {
  const problems = await findProblems();
  if (problems.length > 0) {
    throw new Error(
      [
        'E2E preflight failed; the backoffice tests need Storage, Edge Functions and the mail catcher:',
        ...problems.map((problem) => `  - ${problem}`),
        'Locally run `pnpm stack` (or `pnpm supabase start` + `pnpm supabase functions serve --env-file supabase/.env.local`).',
      ].join('\n'),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wait = process.argv.includes('--wait');
  const deadline = Date.now() + 120_000;
  let problems = await findProblems();
  while (wait && problems.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    problems = await findProblems();
  }
  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log('Storage, Edge Functions and the mail catcher are reachable.');
}
