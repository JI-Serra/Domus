// Bundle the project's reporting module for the Deno deployment boundary.
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageRequire = createRequire(
  new URL('../../packages/supabase/package.json', import.meta.url),
);
const viteRequire = createRequire(packageRequire.resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const sources = ['reporter.ts', 'console-adapter.ts', 'scrub.ts', 'types.ts'];
const hash = createHash('sha256');
for (const source of sources)
  hash.update(
    readFileSync(
      new URL(`../../packages/observability/src/${source}`, import.meta.url),
    ),
  );
const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL('../../packages/observability/src/reporter.ts', import.meta.url),
    ),
  ],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
  banner: {
    js: `// Generated from @domus/observability; source-sha256: ${hash.digest('hex')}`,
  },
});
writeFileSync(
  new URL('./_shared/reporting.js', import.meta.url),
  result.outputFiles[0].text,
);
console.log(
  'Generated Edge reporting bundle from the project reporting module.',
);
