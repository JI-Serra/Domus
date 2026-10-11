// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadPendingVerification } from './verification';

/** Query-builder double: methods record their arguments, awaiting yields the table's result. */
function builder(result: unknown) {
  const calls: [string, unknown[]][] = [];
  const chain: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
  };
  for (const name of [
    'select',
    'eq',
    'neq',
    'is',
    'in',
    'or',
    'order',
    'limit',
  ])
    chain[name] = (...args: unknown[]) => {
      calls.push([name, args]);
      return chain;
    };
  return { chain, calls };
}

function clientFor(rpcResult: unknown, tables: Record<string, unknown>) {
  const built: Record<string, ReturnType<typeof builder>[]> = {};
  return {
    built,
    client: {
      rpc: vi.fn(() => Promise.resolve(rpcResult)),
      from: vi.fn((table: string) => {
        const next = builder(tables[table]);
        (built[table] ??= []).push(next);
        return next.chain;
      }),
    } as never,
  };
}

const personRow = (overrides = {}) => ({
  person_id: 'p1',
  person_first_name: 'Ana',
  person_last_name: 'Choque',
  person_document_type: null,
  person_document_number: null,
  person_email: null,
  person_claimed_document_type: 'dni',
  person_claimed_document_number: '123',
  person_claimed_email: 'a"b@x.com',
  ...overrides,
});

describe('loadPendingVerification', () => {
  it('joins pending claims with their unit, the people who already hold the data, and the plate holders', async () => {
    const { client, built } = clientFor(
      {
        data: {
          people: [personRow()],
          vehicles: [
            {
              vehicle_id: 'v1',
              unit_id: 'u2',
              vehicle_plate_code: 'AB123CD',
              vehicle_make_name: 'Fiat',
              vehicle_model_name: null,
              vehicle_color_name: null,
            },
            {
              vehicle_id: 'v2',
              unit_id: 'u2',
              vehicle_plate_code: 'AB123CD',
              vehicle_make_name: null,
              vehicle_model_name: null,
              vehicle_color_name: null,
            },
          ],
        },
        error: null,
      },
      {
        unit_resident: [
          {
            data: [
              {
                person_id: 'p1',
                unit_id: 'u1',
                unit_resident_valid_from_at: '2020',
              },
            ],
            error: null,
          },
        ],
        person: {
          data: [
            personRow({
              person_id: 'p9',
              person_first_name: 'Quinn',
              person_last_name: 'Titular',
            }),
          ],
          error: null,
        },
        vehicle: {
          data: [
            { vehicle_id: 'v2', unit_id: 'u2' },
            { vehicle_id: 'v9', unit_id: 'u3' },
          ],
          error: null,
        },
        unit: {
          data: [
            { unit_id: 'u1', unit_code: 'Mz 1' },
            { unit_id: 'u2', unit_code: 'Mz 2' },
            { unit_id: 'u3', unit_code: 'Mz 3' },
          ],
          error: null,
        },
      },
    );
    // The holders' residences come from a second unit_resident read.
    (
      client as unknown as { from: ReturnType<typeof vi.fn> }
    ).from.mockImplementation(
      (() => {
        let residentReads = 0;
        const tables: Record<string, unknown> = {
          person: {
            data: [
              personRow({
                person_id: 'p9',
                person_first_name: 'Quinn',
                person_last_name: 'Titular',
              }),
            ],
            error: null,
          },
          vehicle: {
            data: [
              { vehicle_id: 'v2', unit_id: 'u2' },
              { vehicle_id: 'v9', unit_id: 'u3' },
            ],
            error: null,
          },
          unit: {
            data: [
              { unit_id: 'u1', unit_code: 'Mz 1' },
              { unit_id: 'u2', unit_code: 'Mz 2' },
              { unit_id: 'u3', unit_code: 'Mz 3' },
            ],
            error: null,
          },
        };
        return (table: string) => {
          if (table === 'unit_resident') {
            residentReads += 1;
            return builder(
              residentReads === 1
                ? { data: [{ person_id: 'p1', unit_id: 'u1' }], error: null }
                : { data: [{ person_id: 'p9', unit_id: 'u2' }], error: null },
            ).chain;
          }
          const next = builder(tables[table]);
          (built[table] ??= []).push(next);
          return next.chain;
        };
      })(),
    );

    const result = await loadPendingVerification(client, 't1');
    expect(result.people).toEqual([
      {
        person_id: 'p1',
        person_first_name: 'Ana',
        person_last_name: 'Choque',
        registered: { documentType: null, documentNumber: null, email: null },
        declared: {
          documentType: 'dni',
          documentNumber: '123',
          email: 'a"b@x.com',
        },
        unit: { unit_id: 'u1', unit_code: 'Mz 1' },
        holders: [
          {
            person_id: 'p9',
            name: 'Quinn Titular',
            units: [{ unit_id: 'u2', unit_code: 'Mz 2' }],
          },
        ],
      },
    ]);
    // Values inside the holder filter are quoted: a quote in an email cannot change the filter.
    const filter = built.person?.[0]?.calls.find(
      ([name]) => name === 'or',
    )?.[1][0];
    expect(filter).toContain('person_email.eq."a\\"b@x.com"');
    expect(filter).toContain(
      'and(person_document_type.eq."dni",person_document_number.eq."123")',
    );
    // The other pending vehicle is not a holder; the verified one (v9) is.
    expect(
      result.vehicles.map((v) => [
        v.vehicle_id,
        v.holders.map((h) => h.vehicle_id),
      ]),
    ).toEqual([
      ['v1', ['v9']],
      ['v2', ['v9']],
    ]);
    expect(result.vehicles[0]?.unit).toEqual({
      unit_id: 'u2',
      unit_code: 'Mz 2',
    });
  });

  it('is empty without registry rights and fails loudly on other errors', async () => {
    let { client } = clientFor({ data: null, error: { code: '42501' } }, {});
    expect(await loadPendingVerification(client, 't1')).toEqual({
      people: [],
      vehicles: [],
    });
    ({ client } = clientFor({ data: null, error: { code: 'XX' } }, {}));
    await expect(loadPendingVerification(client, 't1')).rejects.toThrow(
      'Could not load pending verification (XX)',
    );
  });

  it('handles nothing pending without touching other tables', async () => {
    const { client } = clientFor(
      { data: { people: [], vehicles: [] }, error: null },
      {},
    );
    expect(await loadPendingVerification(client, 't1')).toEqual({
      people: [],
      vehicles: [],
    });
    expect(
      (client as unknown as { from: ReturnType<typeof vi.fn> }).from,
    ).not.toHaveBeenCalled();
  });
});
