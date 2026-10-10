// T12: independent, real-HTTP security probes against the LOCAL stack and the served Edge Functions.
// Run: node supabase/functions/local-demo.mjs --prepare
//      pnpm supabase functions serve --env-file supabase/.env.local   (second terminal)
//      node --test supabase/probes/http-security.test.mjs
// Configuration comes from SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET /
// MAILPIT_URL when set (CI), otherwise from `supabase status`. Local-only: it refuses any non-local API URL.
// Never prints tokens or credentials. Adds fictional fixtures (accounts, two barrios) that a db reset removes.
import assert from 'node:assert/strict';
import {
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { before, describe, it } from 'node:test';

function localConfiguration() {
  const fromEnvironment = {
    API_URL: process.env.SUPABASE_URL,
    ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    MAILPIT_URL: process.env.MAILPIT_URL,
  };
  if (Object.values(fromEnvironment).every(Boolean)) return fromEnvironment;
  const require = createRequire(new URL('../../package.json', import.meta.url));
  const cli = join(
    dirname(require.resolve('supabase/package.json')),
    'dist/supabase.js',
  );
  const result = spawnSync(
    process.execPath,
    [cli, 'status', '--output', 'json'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, 'The local stack must be running');
  return { ...JSON.parse(result.stdout), ...stripEmpty(fromEnvironment) };
}
function stripEmpty(values) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v));
}

const config = localConfiguration();
assert.match(
  config.API_URL,
  /^http:\/\/(127\.0\.0\.1|localhost):54321$/,
  'Probes are local-only',
);
const run = `${Date.now()}`;
const password = randomBytes(18).toString('hex');

async function call(path, { method = 'GET', token, body, key, headers } = {}) {
  const apikey = key ?? config.ANON_KEY;
  const response = await fetch(`${config.API_URL}${path}`, {
    method,
    headers: {
      apikey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}
const service = (path, options = {}) =>
  call(path, {
    ...options,
    key: config.SERVICE_ROLE_KEY,
    token: config.SERVICE_ROLE_KEY,
  });
const rpc = (name, args, token) =>
  call(`/rest/v1/rpc/${name}`, { method: 'POST', token, body: args });
const invoke = (name, body, token) =>
  call(`/functions/v1/${name}`, { method: 'POST', token, body });
async function rows(path, token) {
  const result = await call(`/rest/v1/${path}`, { token });
  assert.equal(result.status, 200, `GET ${path}: ${result.status}`);
  return result.body;
}
const ok = (result, label) => {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${label}: HTTP ${result.status} ${JSON.stringify(result.body?.code ?? result.body?.error_code ?? '')}`,
  );
  return result.body;
};

// --- JWT helpers (signing is only for forged/negative probes) ---------------------------------------------------
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const claimsOf = (token) =>
  JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
function signHs256(claims, secret) {
  const data = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}`;
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
function signEs256WithForeignKey(claims) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const data = `${encode({ alg: 'ES256', typ: 'JWT', kid: `forged-${run}` })}.${encode(claims)}`;
  const signature = sign('sha256', Buffer.from(data), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${data}.${signature}`;
}
const unsigned = (claims) =>
  `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;

// --- Accounts, MFA and mail ----------------------------------------------------------------------------------
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = Array.from(secret, (char) =>
    alphabet.indexOf(char).toString(2).padStart(5, '0'),
  ).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  const offset = hash[19] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
}
async function createConfirmedUser(email) {
  const created = ok(
    await service('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password, email_confirm: true },
    }),
    'create user',
  );
  return created.id;
}
async function passwordToken(email) {
  return ok(
    await call('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password },
    }),
    'password sign-in',
  ).access_token;
}
async function platformAdministrator(label) {
  const email = `probe.${label}.${run}@domus.local`;
  const id = await createConfirmedUser(email);
  ok(
    await service('/rest/v1/platform_admin', {
      method: 'POST',
      body: { user_id: id },
      headers: { Prefer: 'return=minimal' },
    }),
    'platform admin row',
  );
  const aal1 = await passwordToken(email);
  const factor = ok(
    await call('/auth/v1/factors', {
      method: 'POST',
      token: aal1,
      body: { factor_type: 'totp', friendly_name: `probe-${label}` },
    }),
    'enroll TOTP',
  );
  const challenge = ok(
    await call(`/auth/v1/factors/${factor.id}/challenge`, {
      method: 'POST',
      token: aal1,
      body: {},
    }),
    'challenge TOTP',
  );
  const verified = ok(
    await call(`/auth/v1/factors/${factor.id}/verify`, {
      method: 'POST',
      token: aal1,
      body: { challenge_id: challenge.id, code: totp(factor.totp.secret) },
    }),
    'verify TOTP',
  );
  return { id, email, aal1, aal2: verified.access_token };
}
async function mailbox(email) {
  const response = await fetch(
    `${config.MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
  );
  assert.equal(response.status, 200, 'Mailpit search');
  return (await response.json()).messages ?? [];
}
async function newestVerificationLink(email, previousCount = 0) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const messages = await mailbox(email);
    if (messages.length > previousCount) {
      const message = await fetch(
        `${config.MAILPIT_URL}/api/v1/message/${messages[0].ID}`,
      ).then((response) => response.json());
      const link = /https?:\/\/[^\s<>"]+\/auth\/v1\/verify\?[^\s<>"]+/.exec(
        `${message.Text}\n${message.HTML}`,
      )?.[0];
      assert.ok(link, 'Email contains an Auth verification link');
      return link.replaceAll('&amp;', '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('No email arrived');
}
function invitationSecretOf(verificationLink) {
  const redirect = new URL(
    new URL(verificationLink).searchParams.get('redirect_to'),
  );
  return redirect.searchParams.get('token');
}
async function followVerificationLink(link) {
  const response = await fetch(link, { redirect: 'manual' });
  const location = new URL(response.headers.get('location'));
  const accessToken = new URLSearchParams(location.hash.slice(1)).get(
    'access_token',
  );
  assert.ok(accessToken, 'Verification established an ordinary session');
  return accessToken;
}
async function sendInvitation(admin, tenantId, email, eventId = randomUUID()) {
  return await invoke(
    'send-invitation',
    {
      target_tenant_id: tenantId,
      invited_email: email,
      target_role: 'unit_holder',
      first_name: 'Probe',
      last_name: 'Resident',
      client_event_id: eventId,
    },
    admin,
  );
}

// --- Fixtures ----------------------------------------------------------------------------------------------------
const state = {};
before(async () => {
  const settings = ok(await call('/auth/v1/settings'), 'Auth settings');
  assert.equal(
    settings.mailer_autoconfirm,
    false,
    'Auth must require email confirmation (supabase/config.toml)',
  );
  state.platform = await platformAdministrator('platform');
  state.revoker = await platformAdministrator('revoker');
  state.tenantA = ok(
    await rpc(
      'create_tenant',
      {
        tenant_name: 'Probe Barrio A',
        tenant_slug: `probe-a-${run}`,
        client_event_id: randomUUID(),
      },
      state.platform.aal2,
    ),
    'create tenant A',
  );
  state.tenantB = ok(
    await rpc(
      'create_tenant',
      {
        tenant_name: 'Probe Barrio B',
        tenant_slug: `probe-b-${run}`,
        client_event_id: randomUUID(),
      },
      state.platform.aal2,
    ),
    'create tenant B',
  );
  // One resident belongs to BOTH barrios, each through a real emailed invitation and its own email-link session.
  state.residentEmail = `probe.resident.${run}@domus.local`;
  for (const tenant of [state.tenantA, state.tenantB]) {
    const previous = (await mailbox(state.residentEmail)).length;
    ok(
      await sendInvitation(state.platform.aal2, tenant, state.residentEmail),
      'send invitation',
    );
    const link = await newestVerificationLink(state.residentEmail, previous);
    const session = await followVerificationLink(link);
    ok(
      await rpc(
        'accept_invitation',
        { token: invitationSecretOf(link) },
        session,
      ),
      'accept invitation',
    );
    state.residentId = claimsOf(session).sub;
  }
});

describe('M02 registry over HTTP', () => {
  const tenant = '10000000-0000-0000-0000-000000000001';
  const foreignTenant = '10000000-0000-0000-0000-000000000002';
  const unit = 'a1000000-0000-0000-0000-000000000001';
  const gate = 'd1000000-0000-0000-0000-000000000001';
  const registry = {};
  before(async () => {
    for (const [role, email] of [
      ['admin', 'admin.ceibos@domus.local'],
      ['holder', 'holder.ceibos@domus.local'],
      ['guard', 'guard.ceibos@domus.local'],
    ]) {
      registry[role] = ok(
        await call('/auth/v1/token?grant_type=password', {
          method: 'POST',
          body: { email, password: 'DomusLocal123!' },
        }),
        'seed registry sign-in',
      ).access_token;
    }
  });
  it('enforces tenant isolation, RPC-only writes and the minimized guard projection', async () => {
    const projection = ok(
      await rpc('guard_registry', { target_tenant_id: tenant }, registry.guard),
      'guard projection',
    );
    assert.ok(projection.length >= 28);
    for (const row of projection)
      assert.deepEqual(Object.keys(row).sort(), [
        'person_id',
        'resident_display_name',
        'unit_code',
        'unit_id',
        'unit_resident_is_holder',
        'unit_resident_is_minor',
      ]);
    assert.equal(
      (await rows('person?select=person_id', registry.guard)).length,
      1,
    );
    assert.equal(
      (
        await rpc(
          'guard_registry',
          { target_tenant_id: foreignTenant },
          registry.guard,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await rpc(
          'search_registry',
          { target_tenant_id: foreignTenant, search: 'Mz' },
          registry.admin,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call('/rest/v1/vehicle', {
          method: 'POST',
          token: registry.holder,
          body: {
            tenant_id: tenant,
            unit_id: unit,
            vehicle_plate_code: 'XX000YY',
          },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call('/rest/v1/device?select=device_credential_hash', {
          token: registry.admin,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await rpc(
          'billable_unit_count',
          { target_tenant_id: tenant },
          registry.admin,
        )
      ).body,
      40,
    );
  });
  it('pairs once with a guard, keeps operator identity separate and revokes immediately', async () => {
    const pairing = ok(
      await rpc(
        'create_device_pairing',
        {
          target_tenant_id: tenant,
          target_gate_id: gate,
          client_event_id: randomUUID(),
        },
        registry.admin,
      ),
      'create pairing',
    )[0];
    const redemption = {
      target_tenant_id: tenant,
      pairing_code: pairing.pairing_code,
      device_name: 'HTTP test tablet',
    };
    assert.deepEqual(
      ok(
        await rpc('redeem_device_pairing', redemption, registry.holder),
        'resident pairing denial',
      ),
      { status: 'unavailable' },
    );
    const device = ok(
      await rpc('redeem_device_pairing', redemption, registry.guard),
      'guard pairing',
    );
    assert.equal(device.status, 'paired');
    assert.deepEqual(
      ok(
        await rpc('redeem_device_pairing', redemption, registry.guard),
        'pairing replay',
      ),
      { status: 'unavailable' },
    );
    const sync = {
      target_tenant_id: tenant,
      target_device_id: device.device_id,
      device_token: device.device_token,
    };
    assert.equal(
      ok(await rpc('sync_device', sync, registry.guard), 'device sync').status,
      'active',
    );
    assert.deepEqual(
      ok(
        await rpc('sync_device', sync, registry.holder),
        'operator role denial',
      ),
      { status: 'unavailable' },
    );
    ok(
      await rpc(
        'revoke_device',
        {
          target_tenant_id: tenant,
          target_device_id: device.device_id,
          client_event_id: randomUUID(),
        },
        registry.admin,
      ),
      'revoke device',
    );
    assert.deepEqual(
      ok(await rpc('sync_device', sync, registry.guard), 'revoked device sync'),
      { status: 'unavailable' },
    );
  });
  it('resolves tenantless join codes, minimizes own history and cancels idempotently', async () => {
    const email = `probe.registry.contract.${run}@domus.local`;
    await createConfirmedUser(email);
    const caller = await passwordToken(email);
    const code = ok(
      await rpc(
        'rotate_unit_join_code',
        {
          target_tenant_id: tenant,
          target_unit_id: unit,
        },
        registry.holder,
      ),
      'rotate contract code',
    );
    const input = {
      join_code: code,
      person_data: { person_first_name: 'HTTP', person_last_name: 'Contract' },
      client_event_id: randomUUID(),
    };
    assert.deepEqual(
      ok(
        await rpc(
          'submit_unit_join_request',
          {
            ...input,
            target_tenant_id: foreignTenant,
          },
          caller,
        ),
        'mismatching tenant',
      ),
      { status: 'unavailable' },
    );
    const request = ok(
      await rpc('submit_unit_join_request', input, caller),
      'tenantless request',
    );
    assert.equal(request.status, 'pending');
    const history = ok(
      await rpc('my_unit_join_requests', {}, caller),
      'own history',
    );
    assert.equal(history.length, 1);
    assert.equal(history[0].unit_join_request_id, request.unit_join_request_id);
    assert.deepEqual(Object.keys(history[0]).sort(), [
      'tenant_name',
      'unit_code',
      'unit_join_request_created_at',
      'unit_join_request_id',
      'unit_join_request_status',
    ]);
    assert.equal(typeof history[0].unit_code, 'string');
    assert.deepEqual(
      ok(
        await rpc('my_unit_join_requests', {}, registry.guard),
        'other history',
      ),
      [],
    );
    const cancellation = {
      target_unit_join_request_id: request.unit_join_request_id,
      client_event_id: randomUUID(),
    };
    const denied = await rpc(
      'cancel_unit_join_request',
      cancellation,
      registry.guard,
    );
    const missing = await rpc(
      'cancel_unit_join_request',
      {
        ...cancellation,
        target_unit_join_request_id: randomUUID(),
      },
      registry.guard,
    );
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, missing.body);
    assert.deepEqual(
      ok(await rpc('cancel_unit_join_request', cancellation, caller), 'cancel'),
      { status: 'cancelled' },
    );
    assert.deepEqual(
      ok(
        await rpc('cancel_unit_join_request', cancellation, caller),
        'cancel retry',
      ),
      { status: 'cancelled' },
    );
    assert.equal(
      ok(await rpc('my_unit_join_requests', {}, caller), 'cancelled history')[0]
        .unit_join_request_status,
      'cancelled',
    );
    assert.equal(
      (
        await rpc(
          'cancel_unit_join_request',
          {
            ...cancellation,
            client_event_id: randomUUID(),
          },
          caller,
        )
      ).status,
      403,
    );
    const holderSheet = ok(
      await rpc(
        'unit_sheet',
        {
          target_tenant_id: tenant,
          target_unit_id: unit,
        },
        registry.holder,
      ),
      'holder permission map',
    );
    assert.ok(
      Object.hasOwn(
        holderSheet.member_permissions,
        '40000000-0000-0000-0000-000000000005',
      ),
    );
    const member = ok(
      await call('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: {
          email: 'member.ceibos@domus.local',
          password: 'DomusLocal123!',
        },
      }),
      'seed member sign-in',
    ).access_token;
    const memberSheet = ok(
      await rpc(
        'unit_sheet',
        {
          target_tenant_id: tenant,
          target_unit_id: unit,
        },
        member,
      ),
      'member permission map',
    );
    assert.deepEqual(memberSheet.member_permissions, {});
  });
  it('requires pending join approval and an actual email-link session before household access', async () => {
    const email = `probe.registry.join.${run}@domus.local`;
    await createConfirmedUser(email);
    const caller = await passwordToken(email);
    const code = ok(
      await rpc(
        'rotate_unit_join_code',
        { target_tenant_id: tenant, target_unit_id: unit },
        registry.holder,
      ),
      'rotate join code',
    );
    const request = ok(
      await rpc(
        'submit_unit_join_request',
        {
          target_tenant_id: tenant,
          join_code: code.toLowerCase(),
          person_data: {
            person_first_name: 'HTTP',
            person_last_name: 'Applicant',
          },
          client_event_id: randomUUID(),
        },
        caller,
      ),
      'join request',
    );
    assert.equal(request.status, 'pending');
    assert.equal(
      (
        await rpc(
          'unit_sheet',
          { target_tenant_id: tenant, target_unit_id: unit },
          caller,
        )
      ).status,
      403,
    );
    const approved = ok(
      await rpc(
        'decide_unit_join_request',
        {
          target_tenant_id: tenant,
          target_unit_id: unit,
          target_request_id: request.unit_join_request_id,
          approve: true,
          client_event_id: randomUUID(),
        },
        registry.holder,
      ),
      'approve join',
    );
    assert.equal(approved.status, 'approved');
    assert.equal(
      (
        await rows(
          `membership?select=membership_id&tenant_id=eq.${tenant}`,
          caller,
        )
      ).length,
      0,
    );
    const previous = (await mailbox(email)).length;
    ok(
      await invoke(
        'send-invitation',
        {
          target_tenant_id: tenant,
          target_unit_id: unit,
          target_person_id: approved.person_id,
          invited_email: email,
          target_role: 'household_member',
          client_event_id: approved.invitation_client_event_id,
        },
        registry.holder,
      ),
      'send household email',
    );
    const link = await newestVerificationLink(email, previous);
    assert.equal(
      (
        await rpc(
          'accept_invitation',
          { token: invitationSecretOf(link) },
          caller,
        )
      ).status,
      403,
    );
    const verified = await followVerificationLink(link);
    ok(
      await rpc(
        'accept_invitation',
        { token: invitationSecretOf(link) },
        verified,
      ),
      'accept household invitation',
    );
    assert.deepEqual(
      ok(
        await rpc(
          'current_household_permissions',
          { target_tenant_id: tenant, target_unit_id: unit },
          verified,
        ),
        'default household permissions',
      ),
      ['manage_access_authorizations'],
    );
    const sheet = ok(
      await rpc(
        'unit_sheet',
        { target_tenant_id: tenant, target_unit_id: unit },
        verified,
      ),
      'member sheet',
    );
    assert.equal('balance' in sheet, false);
    assert.equal(sheet.pending_invitations.length, 0);
    assert.equal(
      (
        await rpc(
          'accept_invitation',
          { token: invitationSecretOf(link) },
          verified,
        )
      ).status,
      403,
    );
  });
  it('persists HTTP guessing limits with uniform failures', async () => {
    const email = `probe.registry.guessing.${run}@domus.local`;
    await createConfirmedUser(email);
    const caller = await passwordToken(email);
    const code = ok(
      await rpc(
        'rotate_unit_join_code',
        { target_tenant_id: tenant, target_unit_id: unit },
        registry.holder,
      ),
      'rotate for guessing probe',
    );
    for (let attempt = 0; attempt < 5; attempt++)
      assert.deepEqual(
        ok(
          await rpc(
            'submit_unit_join_request',
            {
              target_tenant_id: tenant,
              join_code: 'AAAA-AAAA-AAAA',
              person_data: {
                person_first_name: 'HTTP',
                person_last_name: 'Guess',
              },
              client_event_id: randomUUID(),
            },
            caller,
          ),
          'wrong join attempt',
        ),
        { status: 'unavailable' },
      );
    assert.deepEqual(
      ok(
        await rpc(
          'submit_unit_join_request',
          {
            target_tenant_id: tenant,
            join_code: code,
            person_data: {
              person_first_name: 'HTTP',
              person_last_name: 'Guess',
            },
            client_event_id: randomUUID(),
          },
          caller,
        ),
        'throttled valid code',
      ),
      { status: 'unavailable' },
    );
    assert.equal(
      (
        await rows(
          `membership?select=membership_id&tenant_id=eq.${tenant}`,
          caller,
        )
      ).length,
      0,
    );
  });
});

async function startSupport() {
  return ok(
    await invoke(
      'support-session',
      {
        action: 'start',
        target_tenant_id: state.tenantA,
        target_user_id: state.residentId,
        reason: 'HTTP security probe',
        duration_minutes: 10,
        client_event_id: randomUUID(),
      },
      state.platform.aal2,
    ),
    'start support session',
  );
}
const tenantIds = async (token) =>
  (await rows('tenant?select=tenant_id', token)).map((row) => row.tenant_id);

// --- Probes ------------------------------------------------------------------------------------------------------
describe('invitations over HTTP', () => {
  it('M2: a password session cannot accept; the emailed link session can', async () => {
    const email = `probe.existing.${run}@domus.local`;
    await createConfirmedUser(email);
    ok(
      await sendInvitation(state.platform.aal2, state.tenantA, email),
      'invite an existing account',
    );
    const link = await newestVerificationLink(email);
    const secret = invitationSecretOf(link);
    const passwordSession = await passwordToken(email);
    assert.deepEqual(
      claimsOf(passwordSession).amr.map((entry) => entry.method),
      ['password'],
    );
    const denied = await rpc(
      'accept_invitation',
      { token: secret },
      passwordSession,
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, '42501');
    const linkSession = await followVerificationLink(link);
    ok(
      await rpc('accept_invitation', { token: secret }, linkSession),
      'accept from the email link session',
    );
  });
  it('L5/L2: retrying send-invitation with the same event id never mails again', async () => {
    const email = `probe.retry.${run}@domus.local`;
    const eventId = randomUUID();
    const first = ok(
      await sendInvitation(state.platform.aal2, state.tenantA, email, eventId),
      'first send',
    );
    await newestVerificationLink(email);
    const second = ok(
      await sendInvitation(state.platform.aal2, state.tenantA, email, eventId),
      'retry',
    );
    assert.equal(second.invitation_id, first.invitation_id);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal((await mailbox(email)).length, 1, 'Exactly one email');
    const direct = await rpc(
      'create_invitation',
      {
        target_tenant_id: state.tenantA,
        invited_email: email,
        target_role: 'unit_holder',
        client_event_id: eventId,
        first_name: 'Probe',
        last_name: 'Resident',
      },
      state.platform.aal2,
    );
    assert.equal(direct.status, 200);
    assert.equal(
      direct.body[0].invitation_token,
      null,
      'No secret after delivery',
    );
    const legacy = await rpc(
      'create_invitation',
      {
        target_tenant_id: state.tenantA,
        invited_email: `probe.legacy.${run}@domus.local`,
        target_role: 'unit_holder',
        client_event_id: randomUUID(),
        token_hash: 'a'.repeat(64),
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
        first_name: 'Probe',
        last_name: 'Legacy',
      },
      state.platform.aal2,
    );
    assert.equal(
      legacy.status,
      404,
      'Client-chosen token hash/expiry is not callable',
    );
  });
});

describe('support tokens over HTTP', () => {
  let support;
  let claims;
  before(async () => {
    support = await startSupport();
    claims = claimsOf(support.access_token);
  });

  it('a live support token reads only its bound barrio', async () => {
    assert.deepEqual(await tenantIds(support.access_token), [state.tenantA]);
    assert.deepEqual(
      await rows(
        `person?select=person_id&tenant_id=eq.${state.tenantB}`,
        support.access_token,
      ),
      [],
    );
    assert.deepEqual(
      await rows(
        `membership?select=membership_id&tenant_id=eq.${state.tenantB}`,
        support.access_token,
      ),
      [],
    );
    assert.deepEqual(
      await rows('invitation?select=invitation_id', support.access_token),
      [],
    );
    assert.equal(claims.support_tenant_id, state.tenantA);
  });

  it('tokens signed with a foreign key, with alg none, or expired are rejected by PostgREST', async () => {
    const forged = [
      [
        'HS256 with a wrong secret',
        signHs256(claims, randomBytes(32).toString('hex')),
      ],
      ['ES256 with an unregistered key', signEs256WithForeignKey(claims)],
      ['unsigned', unsigned(claims)],
      [
        'expired (project key)',
        signHs256(
          {
            ...claims,
            iat: claims.iat - 7200,
            exp: Math.floor(Date.now() / 1000) - 60,
          },
          config.JWT_SECRET,
        ),
      ],
    ];
    for (const [label, token] of forged) {
      const result = await call('/rest/v1/tenant?select=tenant_id', { token });
      assert.equal(result.status, 401, `${label} must be rejected`);
    }
  });

  it('claims that do not match the live session are denied by the database validator', async () => {
    const variants = {
      'tenant claim': { support_tenant_id: state.tenantB },
      'exp beyond the session': { exp: claims.exp + 600 },
      'elevated aal': { aal: 'aal2' },
      'actor claim': { impersonator_user_id: state.revoker.id },
      'Auth session claim': { session_id: randomUUID() },
    };
    for (const [label, change] of Object.entries(variants)) {
      const token = signHs256({ ...claims, ...change }, config.JWT_SECRET);
      assert.deepEqual(
        await tenantIds(token),
        [],
        `${label} must deny identity`,
      );
    }
  });

  it('Auth endpoints reject the support token (no credential, email or MFA changes)', async () => {
    const attempts = [
      ['GET', '/auth/v1/user', undefined],
      ['PUT', '/auth/v1/user', { password: randomBytes(18).toString('hex') }],
      ['PUT', '/auth/v1/user', { email: `probe.hijack.${run}@domus.local` }],
      ['POST', '/auth/v1/factors', { factor_type: 'totp', friendly_name: 'x' }],
      ['DELETE', `/auth/v1/factors/${randomUUID()}`, undefined],
      ['GET', '/auth/v1/reauthenticate', undefined],
      ['POST', '/auth/v1/logout', undefined],
    ];
    for (const [method, path, body] of attempts) {
      const result = await call(path, {
        method,
        token: support.access_token,
        body,
      });
      assert.ok(
        [401, 403].includes(result.status),
        `${method} ${path} must be rejected, got ${result.status}`,
      );
    }
    assert.deepEqual(
      await tenantIds(support.access_token),
      [state.tenantA],
      'Token unchanged',
    );
  });

  it('the support token cannot use invitation or platform RPCs or the platform functions', async () => {
    const attempts = {
      create_invitation: {
        target_tenant_id: state.tenantA,
        invited_email: `probe.support.${run}@domus.local`,
        target_role: 'guard',
        client_event_id: randomUUID(),
        first_name: 'No',
        last_name: 'Way',
      },
      accept_invitation: { token: 'a'.repeat(64) },
      preview_invitation: { token: 'a'.repeat(64) },
      revoke_invitation: { target_invitation_id: randomUUID() },
      mark_invitation_delivered: { target_invitation_id: randomUUID() },
      create_tenant: { tenant_name: 'No', tenant_slug: `probe-no-${run}` },
      update_tenant_platform_settings: {
        target_tenant_id: state.tenantA,
        new_slug: `probe-x-${run}`,
        new_subscription_status: 'active',
      },
      start_support_session: {
        target_tenant_id: state.tenantA,
        target_user_id: state.residentId,
        reason: 'Nested',
        client_event_id: randomUUID(),
      },
      revoke_support_session: {
        target_support_session_id: support.support_session_id,
        reason: 'Self revoke',
      },
      list_support_targets: { target_tenant_id: state.tenantA },
      create_platform_admin: { target_user_id: state.residentId },
    };
    for (const [name, args] of Object.entries(attempts)) {
      const result = await rpc(name, args, support.access_token);
      assert.equal(result.status, 403, `${name} must be denied`);
      assert.equal(
        result.body.code,
        '42501',
        `${name} must be denied with 42501`,
      );
    }
    assert.equal(
      (await rpc('current_user_is_platform_admin', {}, support.access_token))
        .body,
      false,
    );
    const target = `probe.support.mail.${run}@domus.local`;
    const mail = await sendInvitation(
      support.access_token,
      state.tenantA,
      target,
    );
    assert.ok(
      [401, 403].includes(mail.status),
      'send-invitation rejects support tokens',
    );
    const nested = await invoke(
      'support-session',
      {
        action: 'start',
        target_tenant_id: state.tenantA,
        target_user_id: state.residentId,
        reason: 'Nested',
        client_event_id: randomUUID(),
      },
      support.access_token,
    );
    assert.equal(nested.status, 403, 'support-session rejects support tokens');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal((await mailbox(target)).length, 0, 'No email was sent');
  });

  it('an ended session is rejected on the next request', async () => {
    ok(
      await invoke(
        'support-session',
        {
          action: 'end',
          target_support_session_id: support.support_session_id,
        },
        state.platform.aal2,
      ),
      'end support session',
    );
    assert.deepEqual(await tenantIds(support.access_token), []);
  });

  it('L3: another MFA platform administrator revokes a live session; the token dies on the next request', async () => {
    const live = await startSupport();
    assert.deepEqual(await tenantIds(live.access_token), [state.tenantA]);
    const withoutMfa = await rpc(
      'revoke_support_session',
      { target_support_session_id: live.support_session_id, reason: 'No MFA' },
      state.revoker.aal1,
    );
    assert.equal(withoutMfa.status, 403);
    assert.deepEqual(await tenantIds(live.access_token), [state.tenantA]);
    ok(
      await rpc(
        'revoke_support_session',
        {
          target_support_session_id: live.support_session_id,
          reason: 'HTTP probe revocation',
        },
        state.revoker.aal2,
      ),
      'revoke support session',
    );
    assert.deepEqual(await tenantIds(live.access_token), []);
    const [session] = await rows(
      `support_session?select=support_session_status,support_session_ended_by_user_id&support_session_id=eq.${live.support_session_id}`,
      state.revoker.aal2,
    );
    assert.deepEqual(session, {
      support_session_status: 'revoked',
      support_session_ended_by_user_id: state.revoker.id,
    });
  });
});
