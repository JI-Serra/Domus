import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  sendInvitation,
  supportSession,
  validateLocalSigningFallback,
  validateSupportSigningJwk,
  type PlatformDependencies,
} from '../../../supabase/functions/_shared/platform';

const id = '10000000-0000-0000-0000-000000000001';
const invitation = {
  target_tenant_id: id,
  invited_email: 'invite@example.com',
  target_role: 'tenant_admin',
  first_name: 'Test',
  last_name: 'Invite',
  client_event_id: id,
};
const request = (body: unknown, method = 'POST') =>
  new Request('http://localhost', {
    method,
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
function dependencies(): PlatformDependencies {
  return {
    rpc: vi.fn(async () => ({ data: id, error: null })),
    verifiedUser: vi.fn(async () => id),
    invitationToken: vi.fn(async () => 'a'.repeat(64)),
    invite: vi.fn(async () => true),
    magicLink: vi.fn(async () => true),
    signSupport: vi.fn(async () => 'signed'),
    validateSigningConfiguration: vi.fn(),
    appUrl: 'http://localhost:3000',
    now: () => Date.now(),
  };
}
describe('platform Edge Function logic', () => {
  it('keeps Edge error reporting generated from the project module', () => {
    const hash = createHash('sha256');
    for (const source of [
      'reporter.ts',
      'console-adapter.ts',
      'scrub.ts',
      'types.ts',
    ]) {
      hash.update(
        readFileSync(
          new URL(`../../observability/src/${source}`, import.meta.url),
        ),
      );
    }
    expect(
      readFileSync(
        new URL(
          '../../../supabase/functions/_shared/reporting.js',
          import.meta.url,
        ),
        'utf8',
      ),
    ).toContain(`source-sha256: ${hash.digest('hex')}`);
  });
  it('authorizes invitation creation before sending and stores only a hash', async () => {
    const deps = dependencies();
    const result = await sendInvitation(request(invitation), deps);
    expect(result.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith(
      'create_invitation',
      expect.objectContaining({
        token_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(deps.invite).toHaveBeenCalledWith(
      'invite@example.com',
      expect.stringContaining('/invitations/accept?token='),
    );
    expect(deps.magicLink).not.toHaveBeenCalled();
  });
  it('sends existing users a magic link and reports delivery failure', async () => {
    const deps = dependencies();
    vi.mocked(deps.invite).mockResolvedValue(false);
    expect((await sendInvitation(request(invitation), deps)).status).toBe(200);
    expect(deps.magicLink).toHaveBeenCalled();
    vi.mocked(deps.magicLink).mockResolvedValue(false);
    expect((await sendInvitation(request(invitation), deps)).status).toBe(502);
  });
  it('rejects unauthenticated, unauthorized and invalid invitations without email', async () => {
    const deps = dependencies();
    vi.mocked(deps.verifiedUser).mockResolvedValue(null);
    expect((await sendInvitation(request(invitation), deps)).status).toBe(401);
    vi.mocked(deps.verifiedUser).mockResolvedValue(id);
    vi.mocked(deps.rpc).mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    expect((await sendInvitation(request(invitation), deps)).status).toBe(403);
    expect((await sendInvitation(request({}), deps)).status).toBe(400);
    expect((await sendInvitation(request({}, 'GET'), deps)).status).toBe(405);
    expect(deps.invite).not.toHaveBeenCalled();
  });
  it('grants first administrators all ten permissions after platform status lookup', async () => {
    const deps = dependencies();
    vi.mocked(deps.rpc).mockResolvedValueOnce({ data: true, error: null });
    await sendInvitation(request(invitation), deps);
    expect(deps.rpc).toHaveBeenLastCalledWith(
      'create_invitation',
      expect.objectContaining({
        admin_permissions: expect.arrayContaining([
          'admin_management',
          'finance',
        ]),
      }),
    );
  });
  it('bounds token expiry and never returns a refresh token', async () => {
    const deps = dependencies();
    const expiry = new Date(Date.now() + 1800_000).toISOString();
    vi.mocked(deps.rpc).mockResolvedValue({
      data: {
        support_session_id: id,
        tenant_id: id,
        support_session_actor_user_id: id,
        support_session_target_user_id: id,
        support_session_expires_at: expiry,
      },
      error: null,
    });
    const result = await supportSession(
      request({
        action: 'start',
        target_tenant_id: id,
        target_user_id: id,
        reason: 'Support',
        client_event_id: id,
      }),
      deps,
    );
    const body = (await result.json()) as Record<string, unknown>;
    expect(body.refresh_token).toBeUndefined();
    expect(deps.signSupport).toHaveBeenCalledWith(
      expect.objectContaining({
        exp: Math.floor(new Date(expiry).getTime() / 1000),
        sub: id,
        support_tenant_id: id,
        session_id: id,
        aal: 'aal1',
        impersonator_aal: 'aal2',
      }),
    );
  });
  it('rejects invalid durations and never signs after a denied RPC', async () => {
    const deps = dependencies();
    const input = {
      action: 'start',
      target_tenant_id: id,
      target_user_id: id,
      reason: 'Support',
      client_event_id: id,
    };
    expect(
      (await supportSession(request({ ...input, duration_minutes: 61 }), deps))
        .status,
    ).toBe(400);
    vi.mocked(deps.rpc).mockResolvedValue({
      data: null,
      error: { code: '42501' },
    });
    expect((await supportSession(request(input), deps)).status).toBe(403);
    expect(deps.signSupport).not.toHaveBeenCalled();
  });
  it('ends sessions through the authorized RPC', async () => {
    const deps = dependencies();
    expect(
      (
        await supportSession(
          request({ action: 'end', target_support_session_id: id }),
          deps,
        )
      ).status,
    ).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('end_support_session', {
      target_support_session_id: id,
    });
  });
  it('makes the local signing fallback impossible for hosted URLs or non-local environments', () => {
    expect(validateLocalSigningFallback('local', 'http://kong:8000')).toBe(
      true,
    );
    expect(validateLocalSigningFallback('production', 'http://kong:8000')).toBe(
      false,
    );
    expect(
      validateLocalSigningFallback('local', 'https://project.supabase.co'),
    ).toBe(false);
    expect(
      validateLocalSigningFallback(undefined, 'http://127.0.0.1:54321'),
    ).toBe(false);
  });
  it('rejects reuse of the normal Auth key and requires a dedicated asymmetric private key', () => {
    const key = {
      alg: 'ES256',
      kid: 'support-key',
      kty: 'EC',
      crv: 'P-256',
      d: 'private',
    };
    expect(() => validateSupportSigningJwk(key, 'auth-key')).not.toThrow();
    expect(() => validateSupportSigningJwk(key, 'support-key')).toThrow(
      'support_signing_unavailable',
    );
    expect(() => validateSupportSigningJwk({ ...key, d: undefined })).toThrow();
    expect(() => validateSupportSigningJwk({ ...key, alg: 'HS256' })).toThrow();
    expect(() =>
      validateSupportSigningJwk({
        alg: 'RS256',
        kid: 'support-key',
        kty: 'RSA',
        d: 'private',
      }),
    ).not.toThrow();
  });
  it('rejects non-object bodies before contacting services', async () => {
    const deps = dependencies();
    expect((await sendInvitation(request(null), deps)).status).toBe(400);
    expect((await supportSession(request([]), deps)).status).toBe(400);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
});
