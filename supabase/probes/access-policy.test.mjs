// Local-only Auth/PostgREST acceptance; uses and removes its own fictional tenant.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { policyTemplates } from '../../packages/domain/src/access-policy/templates.ts';

const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve('supabase/package.json')),
  'dist/supabase.js',
);
const status = spawnSync(
  process.execPath,
  [cli, 'status', '--output', 'json'],
  { encoding: 'utf8' },
);
assert.equal(status.status, 0, 'Local stack must be running');
const config = JSON.parse(status.stdout);
assert.ok(
  ['127.0.0.1', 'localhost'].includes(new URL(config.API_URL).hostname),
);
const tenant = randomUUID();
const person = randomUUID();
const membership = randomUUID();
const seedTenant = '10000000-0000-0000-0000-000000000001';
let admin;
let member;
function sql(source) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      'supabase_db_domus',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input: source, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}
async function signIn(email) {
  const result = await fetch(
    `${config.API_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: config.ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'DomusLocal123!' }),
    },
  );
  assert.equal(result.status, 200, 'Fictional account sign-in');
  return (await result.json()).access_token;
}
async function rpc(name, input, token) {
  const response = await fetch(`${config.API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  return { status: response.status, data: await response.json() };
}
describe('access policy HTTP security and retries', () => {
  before(async () => {
    sql(`begin;
      insert into public.tenant(tenant_id,tenant_name,tenant_slug) values('${tenant}','Policy HTTP probe','policy-http-${tenant}');
      insert into public.person(person_id,tenant_id,user_id,person_first_name,person_last_name)
        values('${person}','${tenant}','20000000-0000-0000-0000-000000000002','Policy','Probe');
      insert into public.membership(membership_id,tenant_id,person_id,membership_role) values('${membership}','${tenant}','${person}','tenant_admin');
      insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission) values('${tenant}','${membership}','access_config');
      commit;`);
    admin = await signIn('admin.ceibos@domus.local');
    member = await signIn('member.ceibos@domus.local');
  });
  after(() =>
    sql(`begin;
    delete from public.membership_permission where tenant_id='${tenant}';
    delete from public.membership where tenant_id='${tenant}';
    delete from public.person where tenant_id='${tenant}';
    delete from public.tenant where tenant_id='${tenant}';
    commit;`),
  );
  it('returns balanced defaults and config metadata', async () => {
    const result = await rpc(
      'get_access_policy',
      { target_tenant_id: tenant },
      admin,
    );
    assert.equal(result.status, 200);
    assert.deepEqual(result.data.policy, policyTemplates.balanced);
    assert.equal(
      result.data.metadata.access_policy_applied_template,
      'balanced',
    );
  });
  it('returns member-safe rules and uniformly denies foreign tenants and writes', async () => {
    const own = await rpc(
      'get_access_policy',
      { target_tenant_id: seedTenant },
      member,
    );
    assert.equal(own.status, 200);
    assert.equal(Object.hasOwn(own.data, 'metadata'), false);
    for (const target of [tenant, randomUUID()]) {
      const denied = await rpc(
        'get_access_policy',
        { target_tenant_id: target },
        member,
      );
      assert.equal(denied.status, 403);
      assert.equal(denied.data.message, 'Access policy denied');
    }
    const denied = await rpc(
      'update_access_policy',
      {
        target_tenant_id: seedTenant,
        policy: {},
        client_event_id: randomUUID(),
      },
      member,
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.data.message, 'Access policy denied');
    const raw = await fetch(
      `${config.API_URL}/rest/v1/access_policy?tenant_id=eq.${seedTenant}`,
      {
        headers: { apikey: config.ANON_KEY, Authorization: `Bearer ${member}` },
      },
    );
    assert.equal(raw.status, 200);
    assert.deepEqual(await raw.json(), []);
  });
  it('serializes concurrent template retries and records one before/after history entry', async () => {
    const input = {
      target_tenant_id: tenant,
      template: 'strict',
      client_event_id: randomUUID(),
    };
    const results = await Promise.all([
      rpc('apply_access_policy_template', input, admin),
      rpc('apply_access_policy_template', input, admin),
    ]);
    for (const result of results) {
      assert.equal(result.status, 200);
      assert.deepEqual(result.data.policy, policyTemplates.strict);
    }
    assert.deepEqual(results[0].data, results[1].data);
    const history = await rpc(
      'access_policy_history',
      { target_tenant_id: tenant },
      admin,
    );
    assert.equal(history.status, 200);
    assert.equal(history.data.length, 1);
    assert.deepEqual(history.data[0].before_policy, policyTemplates.balanced);
    assert.deepEqual(history.data[0].after_policy, policyTemplates.strict);
    const conflict = await rpc(
      'apply_access_policy_template',
      { ...input, template: 'flexible' },
      admin,
    );
    assert.equal(conflict.status, 403);
    assert.equal(conflict.data.message, 'Access policy retry denied');
  });
  it('validates full replacement over HTTP and rejects direct config writes', async () => {
    const bad = structuredClone(policyTemplates.balanced);
    bad.rules.unknown.access_policy_rule_allowed_modes.push('notify');
    const rejected = await rpc(
      'update_access_policy',
      { target_tenant_id: tenant, policy: bad, client_event_id: randomUUID() },
      admin,
    );
    assert.equal(rejected.status, 400);
    assert.equal(rejected.data.message, 'Invalid access policy');
    const valid = await rpc(
      'update_access_policy',
      {
        target_tenant_id: tenant,
        policy: policyTemplates.flexible,
        client_event_id: randomUUID(),
      },
      admin,
    );
    assert.equal(valid.status, 200);
    assert.deepEqual(valid.data.policy, policyTemplates.flexible);
    assert.equal(valid.data.metadata.access_policy_applied_template, null);
    const raw = await fetch(
      `${config.API_URL}/rest/v1/access_policy?tenant_id=eq.${tenant}`,
      {
        method: 'PATCH',
        headers: {
          apikey: config.ANON_KEY,
          Authorization: `Bearer ${admin}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_policy_approval_timeout_seconds_count: 200,
        }),
      },
    );
    assert.equal(raw.status, 403);
  });
  it('denies suspended writes, including retries, and anonymous/service calls', async () => {
    const event = randomUUID();
    const input = {
      target_tenant_id: tenant,
      template: 'balanced',
      client_event_id: event,
    };
    assert.equal(
      (await rpc('apply_access_policy_template', input, admin)).status,
      200,
    );
    sql(
      `update public.tenant set tenant_subscription_status='suspended' where tenant_id='${tenant}';`,
    );
    assert.equal(
      (await rpc('get_access_policy', { target_tenant_id: tenant }, admin))
        .status,
      200,
    );
    assert.equal(
      (await rpc('apply_access_policy_template', input, admin)).status,
      403,
    );
    for (const token of [config.ANON_KEY, config.SERVICE_ROLE_KEY]) {
      const result = await rpc(
        'get_access_policy',
        { target_tenant_id: tenant },
        token,
      );
      assert.ok([401, 403].includes(result.status));
      assert.equal(result.data.code, '42501');
    }
  });
});
