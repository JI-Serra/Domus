// Writes the Tailwind v4 token stylesheet for apps/web. Run with `pnpm gen:tokens` (Node strips the types).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTokensCss } from '../src/css.ts';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(
  here,
  '../../../apps/web/src/styles/tokens.generated.css',
);

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, generateTokensCss(), 'utf8');
console.log(`Wrote ${target}`);
