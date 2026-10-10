import { describe, expect, it } from 'vitest';
import { PLATFORM_CONTEXT_ID } from './types';
import type { MembershipRecord } from './types';
import {
  isMembershipCurrentlyActive,
  platformContext,
  resolveActiveContext,
} from './resolve';

const NOW = new Date('2026-10-09T15:00:00Z');
const CEIBOS = '10000000-0000-0000-0000-000000000001';
const TIPAS = '10000000-0000-0000-0000-000000000002';

function membership(
  overrides: Partial<MembershipRecord> = {},
): MembershipRecord {
  return {
    membership_id: 'm-ceibos-holder',
    membership_role: 'unit_holder',
    membership_status: 'active',
    membership_valid_from: '2026-01-01T00:00:00+00:00',
    membership_valid_to: null,
    tenant_id: CEIBOS,
    tenant_name: 'Barrio Los Ceibos',
    tenant_time_zone: 'America/Argentina/Tucuman',
    ...overrides,
  };
}

const ceibos = membership();
const tipas = membership({
  membership_id: 'm-tipas-holder',
  tenant_id: TIPAS,
  tenant_name: 'Barrio Las Tipas',
});

function ids(options: readonly { membership_id: string }[]): string[] {
  return options.map((option) => option.membership_id);
}

describe('resolveActiveContext', () => {
  it('a multi-tenant user defaults to the first tenant by name and lists every option', () => {
    const result = resolveActiveContext({
      memberships: [ceibos, tipas],
      now: NOW,
    });
    // "Barrio Las Tipas" sorts before "Barrio Los Ceibos".
    expect(result.active?.membership_id).toBe('m-tipas-holder');
    expect(ids(result.options)).toEqual(['m-tipas-holder', 'm-ceibos-holder']);
  });

  it('honors a requested context that is one of the active memberships', () => {
    const result = resolveActiveContext({
      memberships: [ceibos, tipas],
      requestedContextId: 'm-ceibos-holder',
      now: NOW,
    });
    expect(result.active).toMatchObject({
      membership_id: 'm-ceibos-holder',
      tenant_id: CEIBOS,
      tenant_name: 'Barrio Los Ceibos',
      membership_role: 'unit_holder',
      unit_id: null,
      unit_name: null,
    });
    // The list keeps its order when the selection changes.
    expect(ids(result.options)).toEqual(['m-tipas-holder', 'm-ceibos-holder']);
  });

  it.each([
    ['a forged id', 'forged-membership-id'],
    ['an id from another user', '00000000-0000-4000-8000-0000000000ff'],
    ['an empty cookie', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls back to the default for %s', (_label, requested) => {
    const result = resolveActiveContext({
      memberships: [ceibos, tipas],
      requestedContextId: requested,
      now: NOW,
    });
    expect(result.active?.membership_id).toBe('m-tipas-holder');
  });

  it('a forged platform cookie does not grant the platform context without aal2', () => {
    const result = resolveActiveContext({
      memberships: [ceibos],
      requestedContextId: PLATFORM_CONTEXT_ID,
      platformAdminAal2: false,
      now: NOW,
    });
    expect(result.active?.membership_id).toBe('m-ceibos-holder');
    expect(
      result.options.some(
        (option) => option.membership_role === 'platform_admin',
      ),
    ).toBe(false);
  });

  it('offers the platform context last, and only to a platform admin at aal2', () => {
    const result = resolveActiveContext({
      memberships: [ceibos],
      platformAdminAal2: true,
      now: NOW,
    });
    expect(result.active?.membership_id).toBe('m-ceibos-holder');
    expect(result.options.at(-1)).toEqual(platformContext());

    const requested = resolveActiveContext({
      memberships: [ceibos],
      requestedContextId: PLATFORM_CONTEXT_ID,
      platformAdminAal2: true,
      now: NOW,
    });
    expect(requested.active).toMatchObject({
      membership_id: PLATFORM_CONTEXT_ID,
      tenant_id: null,
      tenant_name: null,
      membership_role: 'platform_admin',
    });
  });

  it('a platform admin without memberships acts on the platform at aal2 and has nothing at aal1', () => {
    expect(
      resolveActiveContext({
        memberships: [],
        platformAdminAal2: true,
        now: NOW,
      }).active?.membership_role,
    ).toBe('platform_admin');
    expect(resolveActiveContext({ memberships: [], now: NOW })).toEqual({
      active: null,
      options: [],
      platformMfaStep: null,
    });
  });

  it('a user without memberships has no active context', () => {
    expect(
      resolveActiveContext({
        memberships: [],
        requestedContextId: 'm-ceibos-holder',
        now: NOW,
      }),
    ).toEqual({ active: null, options: [], platformMfaStep: null });
  });

  it('reports the MFA step instead of hiding the platform option below aal2', () => {
    const challenge = resolveActiveContext({
      memberships: [ceibos],
      platformAdminAal2: false,
      platformMfaStep: 'challenge',
      now: NOW,
    });
    expect(challenge.platformMfaStep).toBe('challenge');
    // Offering the step is not granting the context: it is not an option and a forged cookie does not select it.
    expect(
      challenge.options.some(
        (option) => option.membership_role === 'platform_admin',
      ),
    ).toBe(false);
    expect(
      resolveActiveContext({
        memberships: [ceibos],
        requestedContextId: PLATFORM_CONTEXT_ID,
        platformMfaStep: 'enroll',
        now: NOW,
      }).active?.membership_id,
    ).toBe('m-ceibos-holder');
  });

  it('drops the MFA step once the platform context is granted', () => {
    expect(
      resolveActiveContext({
        memberships: [],
        platformAdminAal2: true,
        platformMfaStep: 'challenge',
        now: NOW,
      }).platformMfaStep,
    ).toBeNull();
  });

  it('filters memberships that are not active even if the database returned them', () => {
    const result = resolveActiveContext({
      memberships: [
        membership({
          membership_id: 'suspended',
          membership_status: 'suspended',
        }),
        membership({ membership_id: 'revoked', membership_status: 'revoked' }),
        membership({
          membership_id: 'expired',
          membership_valid_to: '2026-10-09T14:59:59Z',
        }),
        membership({
          membership_id: 'future',
          membership_valid_from: '2026-10-09T15:00:01Z',
        }),
        tipas,
      ],
      requestedContextId: 'expired',
      now: NOW,
    });
    expect(ids(result.options)).toEqual(['m-tipas-holder']);
    expect(result.active?.membership_id).toBe('m-tipas-holder');
  });

  it('breaks ties on tenant name by role and then id, and ignores duplicate rows', () => {
    const result = resolveActiveContext({
      memberships: [
        membership({ membership_id: 'b-guard', membership_role: 'guard' }),
        membership({
          membership_id: 'a-admin',
          membership_role: 'tenant_admin',
        }),
        membership({ membership_id: 'c-holder' }),
        membership({
          membership_id: 'a-admin',
          membership_role: 'tenant_admin',
        }),
        membership({ membership_id: 'a-holder' }),
      ],
      now: NOW,
    });
    expect(ids(result.options)).toEqual([
      'a-admin',
      'b-guard',
      'a-holder',
      'c-holder',
    ]);
  });

  it('sorts tenant names the es-AR way, ignoring case and accents', () => {
    const result = resolveActiveContext({
      memberships: [
        membership({ membership_id: 'z', tenant_name: 'Zonda' }),
        membership({ membership_id: 'a', tenant_name: 'álamos' }),
      ],
      now: NOW,
    });
    expect(ids(result.options)).toEqual(['a', 'z']);
  });

  it('defaults the evaluation instant to the current time', () => {
    const result = resolveActiveContext({
      memberships: [
        membership({ membership_valid_from: '2000-01-01T00:00:00Z' }),
      ],
    });
    expect(result.active?.membership_id).toBe('m-ceibos-holder');
  });
});

describe('isMembershipCurrentlyActive', () => {
  it('uses a half-open window [from, to)', () => {
    const base = membership({
      membership_valid_from: '2026-10-09T15:00:00Z',
      membership_valid_to: '2026-10-09T16:00:00Z',
    });
    expect(isMembershipCurrentlyActive(base, NOW)).toBe(true);
    expect(
      isMembershipCurrentlyActive(base, new Date('2026-10-09T16:00:00Z')),
    ).toBe(false);
    expect(
      isMembershipCurrentlyActive(base, new Date('2026-10-09T14:59:59Z')),
    ).toBe(false);
  });

  it('fails closed on unparseable dates', () => {
    expect(
      isMembershipCurrentlyActive(
        membership({ membership_valid_from: 'not-a-date' }),
        NOW,
      ),
    ).toBe(false);
    expect(
      isMembershipCurrentlyActive(
        membership({ membership_valid_to: 'not-a-date' }),
        NOW,
      ),
    ).toBe(false);
  });
});
