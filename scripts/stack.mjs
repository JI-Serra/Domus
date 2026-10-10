// One command for local manual review: `pnpm stack`.
// Starts Supabase (if needed), prepares the gitignored env files, serves Edge Functions and runs the web dev
// server on port 3000. Ctrl+C stops the functions and the web server; the Supabase containers keep running
// (pass --stop to stop them too, or run `pnpm supabase stop`).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { prepareFunctionEnv } from './prepare-function-env.mjs';
import {
  ensureSupabaseRunning,
  repoRoot,
  spawnSupabase,
  supabaseCli,
} from './lib/supabase-cli.mjs';

const WEB_PORT = 3000;
const stopSupabase = process.argv.includes('--stop');
const webDir = join(repoRoot, 'apps', 'web');
const nextBin = createRequire(join(webDir, 'package.json')).resolve(
  'next/dist/bin/next',
);

const status = ensureSupabaseRunning();
for (const line of prepareFunctionEnv(status)) console.log(line);

const children = [];
let shuttingDown = false;

function track(name, child) {
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`\n${name} exited unexpectedly (${signal ?? code}).`);
    shutdown(1);
  });
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\nStopping web server and Edge Functions...');
  for (const child of children) killTree(child);
  if (stopSupabase) {
    console.log('Stopping Supabase...');
    spawnSync(process.execPath, [supabaseCli, 'stop'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } else {
    console.log('Supabase is still running (pnpm supabase stop to stop it).');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGBREAK', () => shutdown(0));

const detached = process.platform !== 'win32';
track(
  'Edge Functions',
  spawnSupabase(
    ['functions', 'serve', '--env-file', join('supabase', '.env.local')],
    { detached },
  ),
);
track(
  'Web',
  spawn(
    process.execPath,
    [nextBin, 'dev', '-p', String(WEB_PORT), '-H', '127.0.0.1'],
    { cwd: webDir, stdio: 'inherit', detached },
  ),
);

async function reachable(url, init) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      ...init,
    });
    return response.status !== 404 && response.status < 500;
  } catch {
    return false;
  }
}

const deadline = Date.now() + 180_000;
const functionUrl = `${status.API_URL}/functions/v1/send-invitation`;
const webUrl = `http://127.0.0.1:${WEB_PORT}/login`;
let functionsUp = false;
let webUp = false;
while (!shuttingDown && Date.now() < deadline && !(functionsUp && webUp)) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  functionsUp ||= await reachable(functionUrl, { method: 'POST', body: '{}' });
  webUp ||= await reachable(webUrl);
}
if (!shuttingDown) {
  if (!(functionsUp && webUp)) {
    console.error(
      `\nTimed out waiting for ${functionsUp ? '' : 'Edge Functions '}${webUp ? '' : 'the web server'}.`,
    );
    shutdown(1);
  }
  console.log(`
Domus local stack is ready
  App       http://127.0.0.1:${WEB_PORT}
  Mailpit   ${status.MAILPIT_URL ?? 'http://127.0.0.1:54324'}
  Studio    ${status.STUDIO_URL ?? 'http://127.0.0.1:54323'}
  API       ${status.API_URL}
  Functions ${status.API_URL}/functions/v1
Test users: see README.md (password DomusLocal123!). Ctrl+C to stop.
`);
}
