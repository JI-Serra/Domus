import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// M1 (T10 review): functions are only ever written as complete definitions. A migration must never read a function
// body from the catalog and patch it with replace(): the patch silently over-matches or no-ops, and the function that
// runs can no longer be reviewed from source. The pgTAP schema guard checks the applied statements as well.
const directory = new URL('../../../supabase/migrations/', import.meta.url);
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith('.sql'))
  .map((name) => ({
    name,
    sql: readFileSync(new URL(name, directory), 'utf8'),
  }));
const forbidden: [string, RegExp][] = [
  ['reads function source from the catalog', /pg_get_functiondef|\bprosrc\b/i],
  [
    'rewrites function source with replace()',
    /replace\s*\(\s*(body|definition|source|function_body)\b/i,
  ],
  [
    'executes generated function source',
    /execute\s+[a-z_]*(body|definition)\b/i,
  ],
];

describe('migration source guard', () => {
  it('finds the migrations', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });
  it.each(forbidden)('no migration %s', (_, pattern) => {
    expect(
      migrations.filter(({ sql }) => pattern.test(sql)).map(({ name }) => name),
    ).toEqual([]);
  });
  it('detects the retired pattern', () => {
    const retired =
      "body:=pg_get_functiondef('public.f()'::regprocedure); body:=replace(body,'a','b'); execute body;";
    expect(forbidden.every(([, pattern]) => pattern.test(retired))).toBe(true);
  });
});
