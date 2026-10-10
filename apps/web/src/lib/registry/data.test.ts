// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  listBlockCodes,
  listDevices,
  listGates,
  listGuardInvitations,
  listGuards,
  listUnits,
  loadBillableCount,
  loadBillableCriteria,
  loadPeople,
  loadUnitSheet,
} from './data';

/** A query-builder double: every method records its call and returns the chain; awaiting it yields `result`. */
function builder(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const name of [
    'select',
    'eq',
    'is',
    'not',
    'or',
    'order',
    'range',
    'limit',
    'in',
    'returns',
    'maybeSingle',
  ])
    chain[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  return { chain, calls };
}
const clientFor = (results: Record<string, unknown>, rpcResult?: unknown) => {
  const tables: Record<string, ReturnType<typeof builder>> = {};
  return {
    tables,
    client: {
      from: vi.fn((table: string) => {
        tables[table] = builder(results[table]);
        return tables[table]?.chain;
      }),
      rpc: vi.fn(() => ({
        overrideTypes: () => Promise.resolve(rpcResult),
        then: (resolve: (value: unknown) => unknown) => resolve(rpcResult),
      })),
    } as never,
  };
};

const filters = (overrides = {}) => ({
  q: '',
  block: '',
  page: 1,
  ...overrides,
});

describe('unit list', () => {
  const row = (overrides = {}) => ({
    unit_id: 'u1',
    unit_code: 'Mz 1 Lote 1',
    unit_block_code: '1',
    unit_lot_number: '1',
    unit_status: 'occupied',
    unit_coefficient: 1,
    unit_is_billable: null,
    unit_archived_at: null,
    residents: [{ count: 3 }],
    ...overrides,
  });

  it('applies the barrio criteria and per-unit overrides to each row', async () => {
    const { client } = clientFor({
      unit: {
        data: [
          row(),
          row({ unit_id: 'u2', unit_status: 'vacant' }),
          row({
            unit_id: 'u3',
            unit_status: 'vacant',
            unit_is_billable: true,
            residents: [],
          }),
          row({ unit_id: 'u4', unit_archived_at: '2026-01-01T00:00:00Z' }),
        ],
        count: 40,
        error: null,
      },
    });
    const page = await listUnits(client, 't1', filters() as never, [
      'occupied',
    ]);
    expect(page.total).toBe(40);
    expect(page.pageSize).toBe(25);
    expect(
      page.units.map((unit) => [
        unit.unit_id,
        unit.billable,
        unit.resident_count,
      ]),
    ).toEqual([
      ['u1', true, 3],
      ['u2', false, 3],
      ['u3', true, 0],
      ['u4', false, 3],
    ]);
  });

  it('turns the filters into database conditions, escaping the search term', async () => {
    const { client, tables } = clientFor({
      unit: { data: [], count: 0, error: null },
    });
    await listUnits(
      client,
      't1',
      filters({
        q: 'Mz 1; drop table',
        status: 'vacant',
        block: '2',
        billable: 'no',
        page: 3,
      }) as never,
      ['occupied', 'under_construction'],
    );
    const calls = tables.unit?.calls ?? [];
    expect(calls).toContainEqual(['eq', ['tenant_id', 't1']]);
    expect(calls).toContainEqual(['eq', ['unit_status', 'vacant']]);
    expect(calls).toContainEqual(['eq', ['unit_block_code', '2']]);
    expect(calls).toContainEqual(['range', [50, 74]]);
    expect(calls).toContainEqual(['is', ['unit_archived_at', null]]);
    const ors = calls
      .filter(([name]) => name === 'or')
      .map(([, args]) => String(args[0]));
    expect(ors[0]).toContain('unit_code.ilike.%Mz 1 drop table%');
    expect(ors[0]).not.toContain(';');
    expect(ors[1]).toBe(
      'unit_is_billable.eq.false,and(unit_is_billable.is.null,unit_status.not.in.(occupied,under_construction))',
    );
  });

  it('lists archived units on request, and the billable ones by criteria', async () => {
    const { client, tables } = clientFor({
      unit: { data: [], count: 0, error: null },
    });
    await listUnits(client, 't1', filters({ archived: 'yes' }) as never, []);
    expect(tables.unit?.calls).toContainEqual([
      'not',
      ['unit_archived_at', 'is', null],
    ]);
    await listUnits(client, 't1', filters({ billable: 'yes' }) as never, []);
    const or = tables.unit?.calls.find(([name]) => name === 'or');
    expect(String(or?.[1][0])).toBe(
      'unit_is_billable.eq.true,and(unit_is_billable.is.null,unit_status.in.(vacant))',
    );
  });

  it('fails loudly on a database error', async () => {
    const { client } = clientFor({
      unit: { data: null, count: null, error: { code: 'XX' } },
    });
    await expect(
      listUnits(client, 't1', filters() as never, []),
    ).rejects.toThrow('Could not load units (XX)');
  });
});

describe('registry reads', () => {
  it('reads the billing criteria, the count (null when unavailable) and the blocks', async () => {
    let { client } = clientFor({
      tenant: {
        data: { tenant_billable_unit_statuses: ['occupied'] },
        error: null,
      },
    });
    expect(await loadBillableCriteria(client, 't1')).toEqual(['occupied']);
    ({ client } = clientFor({}, { data: 28, error: null }));
    expect(await loadBillableCount(client, 't1')).toBe(28);
    ({ client } = clientFor({}, { data: null, error: { code: '42501' } }));
    expect(await loadBillableCount(client, 't1')).toBeNull();
    ({ client } = clientFor({
      unit: {
        data: [
          { unit_block_code: '10' },
          { unit_block_code: '2' },
          { unit_block_code: '2' },
          { unit_block_code: null },
        ],
        error: null,
      },
    }));
    expect(await listBlockCodes(client, 't1')).toEqual(['2', '10']);
  });

  it('returns the unit sheet, null when it is not visible, and throws on other errors', async () => {
    let { client } = clientFor(
      {},
      { data: { unit: { unit_id: 'u1' } }, error: null },
    );
    expect(await loadUnitSheet(client, 't1', 'u1')).toEqual({
      unit: { unit_id: 'u1' },
    });
    ({ client } = clientFor({}, { data: null, error: { code: '42501' } }));
    expect(await loadUnitSheet(client, 't1', 'u1')).toBeNull();
    ({ client } = clientFor({}, { data: null, error: { code: 'XX' } }));
    await expect(loadUnitSheet(client, 't1', 'u1')).rejects.toThrow(
      'Could not load the unit (XX)',
    );
  });

  it('maps people by id and skips the query when there is nobody to look up', async () => {
    const { client, tables } = clientFor({
      person: {
        data: [{ person_id: 'p1', person_first_name: 'Ana' }],
        error: null,
      },
    });
    expect(
      (await loadPeople(client, 't1', ['p1'])).get('p1')?.person_first_name,
    ).toBe('Ana');
    expect(tables.person?.calls).toContainEqual(['in', ['person_id', ['p1']]]);
    const none = clientFor({});
    expect((await loadPeople(none.client, 't1', [])).size).toBe(0);
    expect(none.tables.person).toBeUndefined();
  });

  it('flattens guards with their gate assignments, and lists invitations, gates and devices', async () => {
    const { client } = clientFor({
      membership: {
        data: [
          {
            membership_id: 'm1',
            membership_status: 'active',
            membership_valid_from: 'a',
            membership_valid_to: null,
            person: {
              person_first_name: 'Gabi',
              person_last_name: 'G',
              person_email: null,
            },
            gate_guard: [{ gate_id: 'g1' }, { gate_id: 'g2' }],
          },
        ],
        error: null,
      },
      invitation: { data: [{ invitation_id: 'i1' }], error: null },
      gate: { data: [{ gate_id: 'g1' }], error: null },
      device: { data: [{ device_id: 'd1' }], error: null },
    });
    expect(await listGuards(client, 't1')).toEqual([
      expect.objectContaining({
        membership_id: 'm1',
        person_first_name: 'Gabi',
        gate_ids: ['g1', 'g2'],
      }),
    ]);
    expect(await listGuardInvitations(client, 't1')).toEqual([
      { invitation_id: 'i1' },
    ]);
    expect(await listGates(client, 't1')).toEqual([{ gate_id: 'g1' }]);
    expect(await listDevices(client, 't1')).toEqual([{ device_id: 'd1' }]);
  });

  it('throws with the code (never the message) when a read fails', async () => {
    const { client } = clientFor({
      gate: { data: null, error: { code: 'XX', message: 'secret' } },
    });
    await expect(listGates(client, 't1')).rejects.toThrow(
      'Could not load gates (XX)',
    );
  });
});
