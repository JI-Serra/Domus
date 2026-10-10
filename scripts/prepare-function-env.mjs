// Prepares the gitignored local environment files for the running Supabase stack:
//   supabase/.env.local   function secrets (DOMUS_LOCAL_JWT_SECRET, ...)
//   apps/web/.env.local   public Supabase variables for the web app (only created when missing)
// Values are generated at run time and never committed. Nothing secret is printed.
// Usage: node scripts/prepare-function-env.mjs [--force]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStatus, repoRoot } from './lib/supabase-cli.mjs';

const LOCAL_API_URL = 'http://127.0.0.1:54321';

function parseEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

/** Writes both env files from a running stack's status. Returns what it did, for the console summary. */
export function prepareFunctionEnv(status, { force = false } = {}) {
  if (status.API_URL !== LOCAL_API_URL) {
    throw new Error(
      `Refusing to prepare a non-local stack (${status.API_URL}).`,
    );
  }
  const report = [];

  const functionEnvPath = join(repoRoot, 'supabase', '.env.local');
  const previous = existsSync(functionEnvPath)
    ? parseEnv(readFileSync(functionEnvPath, 'utf8'))
    : new Map();
  const next = new Map([
    ['DOMUS_ENVIRONMENT', 'local'],
    ['DOMUS_LOCAL_JWT_SECRET', status.JWT_SECRET],
    ['DOMUS_APP_URL', 'http://127.0.0.1:3000'],
  ]);
  const unchanged =
    !force && [...next].every(([key, value]) => previous.get(key) === value);
  if (!unchanged) {
    writeFileSync(
      functionEnvPath,
      [...next].map(([key, value]) => `${key}=${value}`).join('\n') + '\n',
    );
  }
  report.push(
    `supabase/.env.local ${unchanged ? 'already up to date' : 'written'}`,
  );

  const webEnvPath = join(repoRoot, 'apps', 'web', '.env.local');
  if (existsSync(webEnvPath)) {
    report.push('apps/web/.env.local already exists (kept)');
  } else {
    writeFileSync(
      webEnvPath,
      [
        'DOMUS_ENVIRONMENT=local',
        `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}`,
        `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`,
        '',
      ].join('\n'),
    );
    report.push('apps/web/.env.local created from the running stack');
  }
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const status = readStatus();
  if (!status) {
    console.error('The local stack must be running (pnpm supabase start).');
    process.exit(1);
  }
  for (const line of prepareFunctionEnv(status, {
    force: process.argv.includes('--force'),
  })) {
    console.log(line);
  }
}
