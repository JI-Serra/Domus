// Local-only real-HTTP acceptance; a final db reset removes the fictional scale data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
const require = createRequire(new URL('../../package.json', import.meta.url));
const cli = join(
  dirname(require.resolve('supabase/package.json')),
  'dist/supabase.js',
);
const status = spawnSync(
  process.execPath,
  [cli, 'status', '--output', 'json'],
  { encoding: 'utf8' },
);
assert.equal(status.status, 0, 'Local stack must run');
const config = JSON.parse(status.stdout);
assert.match(
  config.API_URL,
  /^http:\/\/(127\.0\.0\.1|localhost):54321$/,
  'Scale probe is local-only',
);
const tenant = '10000000-0000-0000-0000-000000000001';
const run = Date.now().toString();
async function call(path, body, token) {
  const response = await fetch(`${config.API_URL}${path}`, {
    method: 'POST',
    headers: {
      apikey: config.ANON_KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const result = await response.json();
  assert.ok(
    response.ok,
    `HTTP scale request failed: ${response.status} ${result?.code ?? ''}`,
  );
  return result;
}
const session = await call('/auth/v1/token?grant_type=password', {
  email: 'admin.ceibos@domus.local',
  password: 'DomusLocal123!',
});
const rpc = (name, args) =>
  call(`/rest/v1/rpc/${name}`, args, session.access_token);
const rows = [];
for (let unit = 1; unit <= 2000; unit++)
  for (let resident = 0; resident < 3; resident++)
    rows.push({
      unit_code: `HTTP scale ${run}-${unit}`,
      unit_status: 'occupied',
      person_first_name: 'HTTP',
      person_last_name: `Scale family ${unit} ${resident}`,
      person_email: `http.scale.${run}.${unit}.${resident}@domus.local`,
      unit_resident_relationship: resident === 0 ? 'owner' : 'family',
      unit_resident_is_holder: resident === 0,
      unit_resident_is_minor: resident === 2,
    });
let started = performance.now();
const batch = await rpc('create_registry_import', {
  target_tenant_id: tenant,
  rows,
  client_event_id: randomUUID(),
});
const stagedMs = performance.now() - started;
process.stdout.write(`PASS HTTP stage 6000 rows: ${stagedMs.toFixed(1)} ms\n`);
started = performance.now();
const applied = await rpc('confirm_registry_import', {
  target_tenant_id: tenant,
  target_import_id: batch,
  client_event_id: randomUUID(),
});
const confirmedMs = performance.now() - started;
assert.deepEqual(applied, {
  status: 'confirmed',
  unit_count: 2000,
  resident_count: 6000,
});
process.stdout.write(
  `PASS HTTP atomic confirm 2000 units / 6000 residents: ${confirmedMs.toFixed(1)} ms\n`,
);
started = performance.now();
const results = await rpc('search_registry', {
  target_tenant_id: tenant,
  search: `HTTP scale ${run}-1000`,
});
const searchMs = performance.now() - started;
assert.ok(searchMs < 300, 'HTTP search must stay below 300 ms');
const unit = results.find((row) => row.entity_kind === 'unit');
assert.ok(unit, 'Search finds imported unit');
started = performance.now();
const sheet = await rpc('unit_sheet', {
  target_tenant_id: tenant,
  target_unit_id: unit.unit_id,
});
const sheetMs = performance.now() - started;
assert.equal(sheet.residents.length, 3);
assert.ok(sheetMs < 300, 'HTTP unit sheet must stay below 300 ms');
process.stdout.write(
  `PASS HTTP search ${searchMs.toFixed(1)} ms / unit sheet ${sheetMs.toFixed(1)} ms\n`,
);
