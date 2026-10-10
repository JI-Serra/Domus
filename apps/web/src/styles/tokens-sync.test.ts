import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateTokensCss } from '@domus/ui-tokens';
import { expect, it } from 'vitest';

it('tokens.generated.css matches the typed tokens (run `pnpm gen:tokens` if this fails)', () => {
  const committed = readFileSync(
    join(import.meta.dirname, 'tokens.generated.css'),
    'utf8',
  );
  expect(committed).toBe(generateTokensCss());
});
