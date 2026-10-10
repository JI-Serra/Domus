// Local-only, real HTTP acceptance exercise. Never prints credentials or tokens.
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const rootRequire = createRequire(
  new URL('../../package.json', import.meta.url),
);
const packageRequire = createRequire(
  new URL('../../packages/supabase/package.json', import.meta.url),
);
const { createClient } = packageRequire('@supabase/supabase-js');
const cli = join(
  dirname(rootRequire.resolve('supabase/package.json')),
  'dist/supabase.js',
);
const statusResult = spawnSync(
  process.execPath,
  [cli, 'status', '--output', 'json'],
  { encoding: 'utf8' },
);
assert.equal(statusResult.status, 0, 'Local stack must be running');
const status = JSON.parse(statusResult.stdout);
assert.equal(status.API_URL, 'http://127.0.0.1:54321', 'Demo is local-only');
if (process.argv.includes('--prepare')) {
  writeFileSync(
    new URL('../.env.local', import.meta.url),
    [
      'DOMUS_ENVIRONMENT=local',
      `DOMUS_LOCAL_JWT_SECRET=${status.JWT_SECRET}`,
      `DOMUS_INVITATION_TOKEN_KEY=${randomBytes(32).toString('hex')}`,
      'DOMUS_APP_URL=http://127.0.0.1:3000',
      '',
    ].join('\n'),
  );
  console.log('Local-only function environment prepared (gitignored).');
  process.exit(0);
}
const client = (token) =>
  createClient(status.API_URL, status.ANON_KEY, {
    global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const checked = (result) => {
  assert.equal(result.error, null, JSON.stringify(result.error));
  return result.data;
};
const run = Date.now();
const password = randomBytes(24).toString('hex');
const email = `platform.demo.${run}@domus.local`;
const actor = checked(
  await service.auth.admin.createUser({ email, password, email_confirm: true }),
).user;
const sql = spawnSync(
  'docker',
  [
    'exec',
    '-i',
    'supabase_db_domus',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  {
    input: `insert into public.platform_admin(user_id) values('${actor.id}');`,
    encoding: 'utf8',
  },
);
assert.equal(sql.status, 0, sql.stderr);
const login = client();
checked(await login.auth.signInWithPassword({ email, password }));
const factor = checked(
  await login.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Local demo',
  }),
);
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
const challenge = checked(
  await login.auth.mfa.challenge({ factorId: factor.id }),
);
const verified = checked(
  await login.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code: totp(factor.totp.secret),
  }),
);
const platform = client(verified.access_token);
const tenant = checked(
  await platform.rpc('create_tenant', {
    tenant_name: 'Local Acceptance Tenant',
    tenant_slug: `demo-${run}`,
    client_event_id: randomUUID(),
  }),
);
const invitedEmail = `invite.demo.${run}@domus.local`;
const invite = checked(
  await platform.functions.invoke('send-invitation', {
    body: {
      target_tenant_id: tenant,
      invited_email: invitedEmail,
      target_role: 'tenant_admin',
      first_name: 'Local',
      last_name: 'Acceptance',
      client_event_id: randomUUID(),
    },
  }),
);
let mail;
for (let attempt = 0; attempt < 30; attempt++) {
  const mailbox = await fetch(`${status.MAILPIT_URL}/api/v1/messages`).then(
    (response) => response.json(),
  );
  const message = mailbox.messages.find((entry) =>
    entry.To.some((to) => to.Address === invitedEmail),
  );
  if (message) {
    mail = await fetch(
      `${status.MAILPIT_URL}/api/v1/message/${message.ID}`,
    ).then((response) => response.json());
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
assert.ok(mail, 'Invitation email arrived in Mailpit');
const verificationUrl = [...mail.HTML.matchAll(/href="([^"]+)"/g)]
  .map((match) => match[1].replaceAll('&amp;', '&'))
  .find((url) => url.includes('/auth/v1/verify?'));
assert.ok(verificationUrl, 'Mail contains Supabase Auth verification URL');
const verification = await fetch(verificationUrl, { redirect: 'manual' });
const redirect = new URL(verification.headers.get('location'));
assert.equal(redirect.pathname, '/invitations/accept');
const authToken = new URLSearchParams(redirect.hash.slice(1)).get(
  'access_token',
);
assert.ok(authToken, 'Email confirmation issued ordinary user token');
const target = client(authToken);
const membership = checked(
  await target.rpc('accept_invitation', {
    token: redirect.searchParams.get('token'),
  }),
);
const ownMembership = checked(
  await target.from('membership').select().eq('membership_id', membership),
).at(0);
assert.equal(ownMembership.membership_role, 'tenant_admin');
assert.equal(
  checked(
    await target
      .from('membership_permission')
      .select()
      .eq('membership_id', membership),
  ).length,
  10,
);
console.log(
  `PASS Mailpit email -> verified acceptance -> membership with 10 permissions (invitation ${invite.invitation_id}).`,
);

checked(
  await platform.rpc('update_tenant_platform_settings', {
    target_tenant_id: tenant,
    new_slug: `demo-${run}`,
    new_subscription_status: 'suspended',
  }),
);
const blocked = await target
  .from('person')
  .update({ person_first_name: 'Blocked' })
  .eq('person_id', ownMembership.person_id);
assert.equal(blocked.error?.code, '42501');
assert.equal(checked(await target.from('tenant').select()).length, 1);
console.log(
  'PASS suspended tenant remains readable; profile write rejected with 42501.',
);
checked(
  await platform.rpc('update_tenant_platform_settings', {
    target_tenant_id: tenant,
    new_slug: `demo-${run}`,
    new_subscription_status: 'active',
  }),
);
const targetUser = checked(await target.auth.getUser()).user;
const support = checked(
  await platform.functions.invoke('support-session', {
    body: {
      action: 'start',
      target_tenant_id: tenant,
      target_user_id: targetUser.id,
      reason: 'Verify local support audit',
      duration_minutes: 30,
      client_event_id: randomUUID(),
    },
  }),
);
assert.equal(support.refresh_token, undefined);
const impersonated = client(support.access_token);
assert.equal(checked(await impersonated.from('tenant').select()).length, 1);
checked(
  await impersonated
    .from('person')
    .update({ person_first_name: 'SupportVerified' })
    .eq('person_id', ownMembership.person_id),
);
const events = checked(
  await platform
    .from('audit_event')
    .select()
    .eq('support_session_id', support.support_session_id)
    .eq('audit_event_table_name', 'person'),
);
assert.equal(events.length, 1);
assert.equal(events[0].audit_event_actor_user_id, actor.id);
assert.equal(events[0].audit_event_on_behalf_of_user_id, targetUser.id);
console.log(
  `PASS target write audited with impersonator, target and support session ${support.support_session_id}.`,
);
for (const [path, method, body] of [
  ['/user', 'PUT', { password: randomBytes(24).toString('hex') }],
  ['/user', 'PUT', { email: 'blocked@domus.local' }],
  ['/factors', 'POST', { factor_type: 'totp', friendly_name: 'Blocked' }],
  [`/factors/${randomUUID()}`, 'DELETE', {}],
]) {
  const response = await fetch(`${status.API_URL}/auth/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${support.access_token}`,
      apikey: status.ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  assert.equal(
    response.status,
    403,
    `Support token must be rejected by Auth ${method} ${path}`,
  );
  const error = await response.json();
  assert.equal(error.error_code ?? error.code, 'session_not_found');
}
console.log(
  'PASS direct Auth password, email, MFA enrollment and factor deletion rejected: session_not_found.',
);
const replay = await impersonated.rpc('accept_invitation', {
  token: redirect.searchParams.get('token'),
});
assert.equal(replay.error?.code, '42501');
checked(
  await impersonated.rpc('end_support_session', {
    target_support_session_id: support.support_session_id,
  }),
);
assert.equal(checked(await impersonated.from('tenant').select()).length, 0);
assert.equal(checked(await impersonated.from('person').select()).length, 0);
console.log(
  'PASS support session ended from target token; subsequent reads return zero rows.',
);
console.log('Local HTTP acceptance complete.');
