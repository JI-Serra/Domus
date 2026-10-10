// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadSupportBanner } from './banner';

const claims = {
  sub: 'target',
  support_tenant_id: 'tenant-1',
  support_session_id: 'session-1',
  exp: Math.floor(new Date('2026-10-10T12:30:00Z').getTime() / 1000),
};
const now = new Date('2026-10-10T12:00:00Z');

function fakeClient(options: {
  person?: { person_first_name: string; person_last_name: string } | null;
  tenant?: { tenant_name: string } | null;
}) {
  const calls: Record<string, [string, unknown][]> = {};
  const table = (name: string, row: unknown) => {
    const builder: Record<string, unknown> = {};
    calls[name] = [];
    builder.select = () => builder;
    builder.eq = (column: string, value: unknown) => {
      calls[name]?.push([column, value]);
      return builder;
    };
    builder.maybeSingle = () => Promise.resolve({ data: row, error: null });
    return builder;
  };
  const client = {
    from: vi.fn((name: string) =>
      table(
        name,
        name === 'person' ? (options.person ?? null) : (options.tenant ?? null),
      ),
    ),
  };
  return { client: client as never, calls };
}

describe('loadSupportBanner', () => {
  it('describes the session without exposing a token', async () => {
    const { client, calls } = fakeClient({
      person: { person_first_name: 'Marta', person_last_name: 'Soporte' },
      tenant: { tenant_name: 'Los Ceibos' },
    });
    const banner = await loadSupportBanner(client, claims, now);
    expect(banner).toEqual({
      sessionId: 'session-1',
      targetName: 'Marta Soporte',
      tenantName: 'Los Ceibos',
      expiresAt: '2026-10-10T12:30:00.000Z',
      serverNow: '2026-10-10T12:00:00.000Z',
    });
    expect(JSON.stringify(banner)).not.toContain('token');
    // Pinned to the target and to the tenant of the session, never to a name from the request.
    expect(calls.person).toEqual([
      ['tenant_id', 'tenant-1'],
      ['user_id', 'target'],
    ]);
  });

  it('leaves the name empty when the target cannot read their own person row', async () => {
    const { client } = fakeClient({ person: null, tenant: null });
    const banner = await loadSupportBanner(client, claims, now);
    expect(banner.targetName).toBe('');
    expect(banner.tenantName).toBe('');
  });
});
