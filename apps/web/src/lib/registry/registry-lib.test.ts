// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundSignal, navigatesTo } from '@/test/server-mocks';

const reportError = vi.fn();
vi.mock('@domus/observability', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
const getRequestContext = vi.fn();
vi.mock('@/lib/context/request-context', () => ({
  getRequestContext: () => getRequestContext(),
}));
const permissionRows = vi.fn();
vi.mock('@/lib/supabase/request-client', () => ({
  createRequestClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => permissionRows() }),
    }),
  }),
}));
const getTenantWritable = vi.fn();
vi.mock('@/lib/tenant/status', () => ({
  getTenantWritable: () => getTenantWritable(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFoundSignal();
  },
}));
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  // Per-request memoization is not under test: every call runs.
  cache: <T>(fn: T) => fn,
}));

const { registryErrorKey } = await import('./errors');
const { getAdminScope, requireAdminScope } = await import('./guard');
const { getAdminPermissions } = await import('./permissions');
const { parseImportFile, ImportFileError } = await import('./import-parse');
const { canPairDevices } = await import('@/lib/devices/access');
const { encodeDeviceCookie, parseDeviceCookie } =
  await import('@/lib/devices/cookie');

beforeEach(() => vi.clearAllMocks());

describe('registryErrorKey', () => {
  it.each([
    [{ code: '42501' }, 'denied'],
    [{ code: '22023' }, 'invalid'],
    [{ code: '23503' }, 'invalid'],
    [
      { code: '23514', message: 'Occupied unit needs a holder' },
      'occupiedNeedsHolder',
    ],
    [{ code: '23514', message: 'something else' }, 'invalid'],
    [
      { code: '23505', message: 'violates unit_tenant_id_unit_code_key' },
      'unitCodeTaken',
    ],
    [{ code: '23505', details: 'vehicle_plate_code' }, 'plateTaken'],
    [{ code: '23505', message: 'person_email key' }, 'personTaken'],
    [{ code: '23505', message: 'whatever' }, 'duplicate'],
    [{ code: '40P01' }, 'busy'],
    [{ code: '40001' }, 'busy'],
    [{ code: '55P03' }, 'busy'],
  ])('%j → %s, without reporting', (error, key) => {
    expect(registryErrorKey(error, 'op')).toBe(key);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports what it does not expect, with the code only (never the database text)', () => {
    expect(
      registryErrorKey(
        { code: 'XX000', message: 'secret person@x.com' },
        'unit.save',
      ),
    ).toBe('unknown');
    expect(reportError).toHaveBeenCalledOnce();
    const [error, context] = reportError.mock.calls[0] ?? [];
    expect((error as Error).message).toBe('unit.save failed (XX000)');
    expect(context).toEqual({ operation: 'unit.save' });
  });
});

const admin = (role = 'tenant_admin') => ({
  resolved: {
    active: {
      membership_id: 'm1',
      tenant_id: 't1',
      membership_role: role,
    },
  },
});

describe('administrator scope', () => {
  it('reads the active administrator permissions and ignores unknown values', async () => {
    getRequestContext.mockResolvedValue(admin());
    permissionRows.mockResolvedValue({
      data: [
        { membership_permission_admin_permission: 'registry' },
        { membership_permission_admin_permission: 'guards' },
        { membership_permission_admin_permission: 'made_up' },
      ],
      error: null,
    });
    expect(await getAdminPermissions()).toEqual(['registry', 'guards']);
  });

  it('has none for other roles and fails loudly when they cannot be read', async () => {
    getRequestContext.mockResolvedValue(admin('guard'));
    expect(await getAdminPermissions()).toEqual([]);
    expect(permissionRows).not.toHaveBeenCalled();
    getRequestContext.mockResolvedValue(null);
    expect(await getAdminPermissions()).toEqual([]);
    getRequestContext.mockResolvedValue(admin());
    permissionRows.mockResolvedValue({ data: null, error: { code: 'XX' } });
    await expect(getAdminPermissions()).rejects.toThrow(
      'Could not load permissions (XX)',
    );
  });

  it('gives the scope only when one of the permissions is held', async () => {
    getRequestContext.mockResolvedValue(admin());
    permissionRows.mockResolvedValue({
      data: [{ membership_permission_admin_permission: 'guards' }],
      error: null,
    });
    getTenantWritable.mockResolvedValue(true);
    expect(await getAdminScope('registry')).toBeNull();
    expect(await getAdminScope('registry', 'guards')).toMatchObject({
      tenantId: 't1',
      membershipId: 'm1',
      writable: true,
    });
    getTenantWritable.mockResolvedValue(false);
    expect(await getAdminScope('guards')).toMatchObject({ writable: false });
  });

  it('is never granted to other roles, and pages answer 404 instead', async () => {
    getRequestContext.mockResolvedValue(admin('unit_holder'));
    expect(await getAdminScope('registry')).toBeNull();
    expect(await navigatesTo(() => requireAdminScope('registry'))).toBe(
      'not-found',
    );
  });
});

describe('pairing access', () => {
  it('allows a guard, or an administrator with guards, and never a support session', async () => {
    getRequestContext.mockResolvedValue(admin('guard'));
    expect(await canPairDevices()).toBe('t1');

    getRequestContext.mockResolvedValue(admin());
    permissionRows.mockResolvedValue({
      data: [{ membership_permission_admin_permission: 'registry' }],
      error: null,
    });
    expect(await canPairDevices()).toBeNull();
    permissionRows.mockResolvedValue({
      data: [{ membership_permission_admin_permission: 'guards' }],
      error: null,
    });
    expect(await canPairDevices()).toBe('t1');

    getRequestContext.mockResolvedValue({ ...admin('guard'), support: {} });
    expect(await canPairDevices()).toBeNull();
    getRequestContext.mockResolvedValue(admin('unit_holder'));
    expect(await canPairDevices()).toBeNull();
  });
});

describe('device cookie', () => {
  const credential = {
    tenant_id: 't1',
    device_id: 'd1',
    device_token: 'c'.repeat(64),
  };

  it('round-trips and rejects anything malformed', () => {
    expect(parseDeviceCookie(encodeDeviceCookie(credential))).toEqual(
      credential,
    );
    expect(parseDeviceCookie(undefined)).toBeNull();
    expect(parseDeviceCookie('not base64 json')).toBeNull();
    expect(
      parseDeviceCookie(
        encodeDeviceCookie({ ...credential, device_token: 'short' }),
      ),
    ).toBeNull();
    expect(
      parseDeviceCookie(Buffer.from('{"tenant_id":1}').toString('base64url')),
    ).toBeNull();
  });
});

const FIXTURE = path.resolve(
  process.cwd(),
  '../../supabase/fixtures/registry-demo-150.csv',
);
const csvFile = (text: string, name = 'f.csv') => new File([text], name);

describe('reading import files in the browser', () => {
  it('parses the 150-unit fixture: 450 rows, no errors, spreadsheet lines kept', async () => {
    const parsed = await parseImportFile(
      csvFile(readFileSync(FIXTURE, 'utf8')),
      '2026-10-10',
    );
    expect(parsed.rows).toHaveLength(450);
    expect(parsed.preview.filter((row) => row.errors.length > 0)).toEqual([]);
    expect(parsed.lines[0]).toBe(2);
    expect(parsed.lines.at(-1)).toBe(451);
    expect(parsed.unknownColumns).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      unit_code: 'Demo Mz 1 Lote 1',
      unit_coefficient: 1,
      unit_resident_is_holder: true,
      unit_resident_is_minor: false,
    });
  });

  it('detects a semicolon separator, a byte order mark and decimal commas', async () => {
    const parsed = await parseImportFile(
      csvFile('﻿unit_code;unit_coefficient;planta\nA1;1,5;2\n'),
      '2026-10-10',
    );
    expect(parsed.rows).toEqual([{ unit_code: 'A1', unit_coefficient: 1.5 }]);
    expect(parsed.unknownColumns).toEqual(['planta']);
  });

  it.each([
    ['notes.txt', 'hola', 'type'],
    ['a.csv', 'unit_status\nvacant', 'missingColumns'],
    ['a.csv', 'unit_code,unit_code\nA,B', 'duplicateColumns'],
    ['a.csv', 'unit_code\n', 'empty'],
  ])('rejects %s (%s) as a whole-file problem', async (name, text, problem) => {
    await expect(
      parseImportFile(csvFile(text, name), '2026-10-10'),
    ).rejects.toMatchObject({ problem });
  });

  it('rejects files that are too large or have too many rows', async () => {
    const big = { name: 'x.csv', size: 6 * 1024 * 1024 } as File;
    await expect(parseImportFile(big, '2026-10-10')).rejects.toBeInstanceOf(
      ImportFileError,
    );
    const lines = [
      'unit_code',
      ...Array.from({ length: 8001 }, (_, i) => `U${i}`),
    ];
    await expect(
      parseImportFile(csvFile(lines.join('\n')), '2026-10-10'),
    ).rejects.toMatchObject({ problem: 'tooManyRows' });
  });

  it('reports per-row problems as codes', async () => {
    const parsed = await parseImportFile(
      csvFile('unit_code,unit_coefficient\nA1,abc\nA2,2\n'),
      '2026-10-10',
    );
    expect(parsed.preview.map((row) => row.errors.map((e) => e.code))).toEqual([
      ['unit_coefficient_invalid'],
      [],
    ]);
  });
});
