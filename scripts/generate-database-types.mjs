import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Run the installed Node CLI shim without shell redirects or platform-specific paths.
const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve('supabase/package.json')),
  'dist/supabase.js',
);
const result = spawnSync(
  process.execPath,
  [cli, 'gen', 'types', 'typescript', '--local'],
  { encoding: 'utf8' },
);
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
writeFileSync(
  new URL('../packages/supabase/src/database.types.ts', import.meta.url),
  result.stdout,
);
