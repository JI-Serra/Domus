// `pnpm stack:reset`: resets the local database (migrations + seed) and refreshes the env files.
// Explicit and separate from `pnpm stack` because it destroys local data.
import { prepareFunctionEnv } from './prepare-function-env.mjs';
import {
  ensureSupabaseRunning,
  readStatus,
  runSupabase,
} from './lib/supabase-cli.mjs';

ensureSupabaseRunning();
console.log('Resetting the local database (migrations + seed)...');
const reset = runSupabase(['db', 'reset'], { stdio: 'inherit' });
if (reset.status !== 0) process.exit(reset.status ?? 1);
const status = readStatus();
if (!status) {
  console.error('The local stack is not healthy after the reset.');
  process.exit(1);
}
for (const line of prepareFunctionEnv(status)) console.log(line);
console.log(
  'Database reset and reseeded. Restart `pnpm stack` if it was running.',
);
