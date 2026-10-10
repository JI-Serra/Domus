// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadCancelledTenants } from '@/lib/tenant/cancelled';
import { parseAuthHash } from './hash';
import { previewInvitation } from './preview';

describe('parseAuthHash', () => {
  it('reads the session the email link left in the fragment', () => {
    expect(
      parseAuthHash(
        '#access_token=acc&refresh_token=ref&expires_in=3600&type=invite',
      ),
    ).toEqual({
      kind: 'session',
      session: { accessToken: 'acc', refreshToken: 'ref' },
    });
    expect(parseAuthHash('access_token=acc&refresh_token=ref')).toMatchObject({
      kind: 'session',
    });
  });

  it('recognises errors left by the auth server', () => {
    expect(
      parseAuthHash('#error=access_denied&error_code=otp_expired'),
    ).toEqual({ kind: 'error' });
    expect(parseAuthHash('#error_description=expired')).toEqual({
      kind: 'error',
    });
  });

  it('ignores everything else, including half a session', () => {
    expect(parseAuthHash('')).toEqual({ kind: 'none' });
    expect(parseAuthHash('#top')).toEqual({ kind: 'none' });
    expect(parseAuthHash('#access_token=acc')).toEqual({ kind: 'none' });
  });
});

describe('previewInvitation', () => {
  const client = (result: unknown) =>
    ({ rpc: vi.fn().mockResolvedValue(result) }) as never;

  it('returns the tenant name and role', async () => {
    const rpc = client({
      data: [
        {
          tenant_name: 'Los Ceibos',
          invitation_membership_role: 'tenant_admin',
        },
      ],
      error: null,
    });
    await expect(previewInvitation(rpc, 'tok')).resolves.toEqual({
      tenantName: 'Los Ceibos',
      role: 'tenant_admin',
    });
  });

  it('is null for every failure, so nothing is revealed about why', async () => {
    await expect(
      previewInvitation(client({ data: null, error: { code: '42501' } }), 't'),
    ).resolves.toBeNull();
    await expect(
      previewInvitation(client({ data: [], error: null }), 't'),
    ).resolves.toBeNull();
  });
});

describe('loadCancelledTenants', () => {
  it('returns the caller’s cancelled barrios', async () => {
    const rows = [{ tenant_id: 't', tenant_name: 'Viejo' }];
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: rows, error: null }),
    } as never;
    await expect(loadCancelledTenants(client)).resolves.toEqual(rows);
  });

  it('fails loudly, with the code only', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501' } }),
    } as never;
    await expect(loadCancelledTenants(client)).rejects.toThrow(
      'Could not load cancelled tenants (42501)',
    );
  });
});
