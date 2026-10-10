// Shared helpers for the local-stack scripts. Runs the pinned Supabase CLI through Node, so it works the same
// on Windows and POSIX (no shell, no .cmd shims).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const rootRequire = createRequire(join(repoRoot, 'package.json'));
export const supabaseCli = join(
  dirname(rootRequire.resolve('supabase/package.json')),
  'dist/supabase.js',
);

/** Spawns the Supabase CLI. `stdio` defaults to inheriting the parent's console. */
export function spawnSupabase(args, options = {}) {
  return spawn(process.execPath, [supabaseCli, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });
}

/** Runs the Supabase CLI to completion and returns the spawnSync result. */
export function runSupabase(args, options = {}) {
  return spawnSync(process.execPath, [supabaseCli, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

/** Returns the parsed `supabase status` values, or `null` when the local stack is not running. */
export function readStatus() {
  const result = runSupabase(['status', '--output', 'json']);
  if (result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Starts the local stack (all services) and returns its status. Exits the process on failure. */
export function ensureSupabaseRunning() {
  let status = readStatus();
  if (status) return status;
  console.log('Starting the local Supabase stack (first run pulls images)...');
  const start = runSupabase(['start'], { stdio: 'inherit' });
  status = start.status === 0 ? readStatus() : null;
  if (!status) {
    console.error(
      'Could not start the local Supabase stack. Is Docker running? See "Troubleshooting" in README.md.',
    );
    process.exit(1);
  }
  return status;
}
