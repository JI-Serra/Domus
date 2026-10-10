import { describe, expect, it } from 'vitest';
import {
  ARGENTINA_TIME_ZONES,
  LOGO_MAX_BYTES,
  billableCriteriaFormSchema,
  canRevokeInvitation,
  fieldErrors,
  firstAdminFormSchema,
  formatCountdown,
  invitationDisplayStatus,
  isInvitationToken,
  logoObjectPath,
  logoProblem,
  readSupportTokenClaims,
  slugify,
  supportActualMinutes,
  supportDisplayStatus,
  supportRemainingSeconds,
  supportStartFormSchema,
  tenantDetailsSchema,
  tenantFormSchema,
  timeZoneOptions,
} from './index';

const tenantId = '10000000-0000-0000-0000-000000000001';
const userId = '20000000-0000-0000-0000-000000000002';

describe('tenant form', () => {
  it('slugifies names to ASCII words', () => {
    expect(slugify('Barrio Los Ñandúes — Etapa 2')).toBe(
      'barrio-los-nandues-etapa-2',
    );
    expect(slugify('  ¡¡¡  ')).toBe('');
    expect(slugify('a'.repeat(120)).length).toBe(100);
    expect(slugify(`${'a'.repeat(99)} b`)).toBe('a'.repeat(99));
  });

  it('parses a valid form with defaults and trims', () => {
    const values = tenantFormSchema.parse({
      tenant_name: '  Los Ceibos ',
      tenant_slug: 'los-ceibos',
      tenant_address: '   ',
    });
    expect(values).toEqual({
      tenant_name: 'Los Ceibos',
      tenant_slug: 'los-ceibos',
      tenant_address: null,
      tenant_time_zone: 'America/Argentina/Tucuman',
      tenant_subscription_status: 'pilot',
    });
  });

  it('reports message keys per field', () => {
    const result = tenantFormSchema.safeParse({
      tenant_name: ' ',
      tenant_slug: 'Bad Slug',
      tenant_time_zone: 'Nope/Zone',
      tenant_address: 'x'.repeat(501),
      tenant_subscription_status: 'pilot',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      tenant_name: 'nameRequired',
      tenant_slug: 'slugInvalid',
      tenant_time_zone: 'timeZoneInvalid',
      tenant_address: 'addressTooLong',
    });
  });

  it('requires a slug and accepts the details subset for edits', () => {
    const result = tenantFormSchema.safeParse({
      tenant_name: 'X',
      tenant_slug: '',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error).tenant_slug).toBe('slugRequired');
    expect(
      tenantDetailsSchema.parse({ tenant_name: 'X', tenant_address: null })
        .tenant_address,
    ).toBeNull();
  });

  it('keeps the first problem of a field and falls back to "form"', () => {
    const result = billableCriteriaFormSchema.safeParse([]);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error)).toEqual({ form: 'billableRequired' });
  });

  it('validates billable criteria as a non-empty set', () => {
    expect(billableCriteriaFormSchema.safeParse(['occupied']).success).toBe(
      true,
    );
    expect(
      billableCriteriaFormSchema.safeParse(['occupied', 'occupied']).success,
    ).toBe(false);
    expect(billableCriteriaFormSchema.safeParse(['other']).success).toBe(false);
  });

  it('offers Argentine zones and keeps an unusual current one', () => {
    expect(timeZoneOptions()).toEqual([...ARGENTINA_TIME_ZONES]);
    expect(timeZoneOptions('America/Argentina/Salta')).toEqual([
      ...ARGENTINA_TIME_ZONES,
    ]);
    expect(timeZoneOptions('America/Montevideo')[0]).toBe('America/Montevideo');
  });

  it('checks logo files and names the stored object', () => {
    expect(logoProblem({ type: 'image/png', size: 1000 })).toBeNull();
    expect(logoProblem({ type: 'image/gif', size: 1000 })).toBe('logoType');
    expect(logoProblem({ type: 'image/webp', size: LOGO_MAX_BYTES + 1 })).toBe(
      'logoSize',
    );
    expect(logoProblem({ type: 'image/jpeg', size: 0 })).toBe('logoSize');
    expect(logoObjectPath(tenantId, 'image/jpeg')).toBe(`${tenantId}/logo.jpg`);
    expect(logoObjectPath(tenantId, 'image/png')).toBe(`${tenantId}/logo.png`);
    expect(logoObjectPath(tenantId, 'image/webp')).toBe(
      `${tenantId}/logo.webp`,
    );
  });
});

describe('invitations', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const pending = {
    invitation_status: 'pending' as const,
    invitation_expires_at: '2026-10-11T12:00:00Z',
  };

  it('shows an overdue pending invitation as expired', () => {
    expect(invitationDisplayStatus(pending, now)).toBe('pending');
    expect(
      invitationDisplayStatus(
        { ...pending, invitation_expires_at: '2026-10-10T12:00:00Z' },
        now,
      ),
    ).toBe('expired');
    expect(
      invitationDisplayStatus(
        { ...pending, invitation_status: 'revoked' },
        now,
      ),
    ).toBe('revoked');
  });

  it('allows revoking only live pending invitations', () => {
    expect(canRevokeInvitation(pending, now)).toBe(true);
    expect(
      canRevokeInvitation({ ...pending, invitation_status: 'accepted' }, now),
    ).toBe(false);
    expect(
      canRevokeInvitation(
        { ...pending, invitation_expires_at: '2026-10-01T00:00:00Z' },
        now,
      ),
    ).toBe(false);
  });

  it('validates the first administrator', () => {
    expect(
      firstAdminFormSchema.parse({
        invited_email: ' Ana@Ejemplo.COM ',
        first_name: ' Ana ',
        last_name: 'Pérez',
      }),
    ).toEqual({
      invited_email: 'ana@ejemplo.com',
      first_name: 'Ana',
      last_name: 'Pérez',
    });
    const result = firstAdminFormSchema.safeParse({
      invited_email: 'nope',
      first_name: '',
      last_name: '',
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error)).toEqual({
        invited_email: 'emailInvalid',
        first_name: 'firstNameRequired',
        last_name: 'lastNameRequired',
      });
    const empty = firstAdminFormSchema.safeParse({
      invited_email: '',
      first_name: 'a',
      last_name: 'b',
    });
    if (!empty.success)
      expect(fieldErrors(empty.error).invited_email).toBe('emailRequired');
  });

  it('recognises the token format', () => {
    expect(isInvitationToken('a'.repeat(64))).toBe(true);
    expect(isInvitationToken('A'.repeat(64))).toBe(false);
    expect(isInvitationToken('abc')).toBe(false);
    expect(isInvitationToken(undefined)).toBe(false);
  });
});

describe('support', () => {
  it('validates the start form and defaults to 30 minutes', () => {
    const values = supportStartFormSchema.parse({
      target_tenant_id: tenantId,
      target_user_id: userId,
      reason: '  Revisar un acceso  ',
    });
    expect(values.duration_minutes).toBe(30);
    expect(values.reason).toBe('Revisar un acceso');
    expect(
      supportStartFormSchema.parse({
        target_tenant_id: tenantId,
        target_user_id: userId,
        reason: 'x',
        duration_minutes: '45',
      }).duration_minutes,
    ).toBe(45);
  });

  it('reports each problem with its key', () => {
    const result = supportStartFormSchema.safeParse({
      target_tenant_id: '',
      target_user_id: 'nope',
      reason: ' ',
      duration_minutes: '61',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrors(result.error)).toEqual({
      target_tenant_id: 'tenantRequired',
      target_user_id: 'userRequired',
      reason: 'reasonRequired',
      duration_minutes: 'durationInvalid',
    });
    for (const bad of ['0', '1.5', 'abc'])
      expect(
        supportStartFormSchema.safeParse({
          target_tenant_id: tenantId,
          target_user_id: userId,
          reason: 'x',
          duration_minutes: bad,
        }).success,
      ).toBe(false);
    expect(
      supportStartFormSchema.safeParse({
        target_tenant_id: tenantId,
        target_user_id: userId,
        reason: 'x'.repeat(501),
      }).success,
    ).toBe(false);
  });

  it('counts down without going negative', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    expect(supportRemainingSeconds('2026-10-10T12:30:00Z', now)).toBe(1800);
    expect(supportRemainingSeconds('2026-10-10T12:00:00.400Z', now)).toBe(1);
    expect(supportRemainingSeconds('2026-10-10T11:00:00Z', now)).toBe(0);
    expect(supportRemainingSeconds('garbage', now)).toBe(0);
    expect(supportRemainingSeconds(now.getTime() + 5000, now)).toBe(5);
    expect(formatCountdown(1800)).toBe('30:00');
    expect(formatCountdown(65)).toBe('01:05');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-4)).toBe('00:00');
    expect(formatCountdown(3600)).toBe('60:00');
  });

  it('derives display status and duration', () => {
    const now = new Date('2026-10-10T12:00:00Z');
    const base = {
      support_session_status: 'active' as const,
      support_session_started_at: '2026-10-10T11:00:00Z',
      support_session_ended_at: null,
      support_session_expires_at: '2026-10-10T11:30:00Z',
    };
    expect(supportDisplayStatus(base, now)).toBe('expired');
    expect(
      supportDisplayStatus(
        { ...base, support_session_expires_at: '2026-10-10T12:30:00Z' },
        now,
      ),
    ).toBe('active');
    expect(
      supportDisplayStatus({ ...base, support_session_status: 'ended' }, now),
    ).toBe('ended');
    expect(supportActualMinutes(base)).toBe(30);
    expect(
      supportActualMinutes({
        ...base,
        support_session_ended_at: '2026-10-10T11:12:00Z',
      }),
    ).toBe(12);
  });
});

describe('support token claims', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (claims: Record<string, unknown>) =>
    `${encode({ alg: 'HS256' })}.${encode(claims)}.signature`;
  const valid = {
    sub: userId,
    support_session_id: 'session',
    support_tenant_id: tenantId,
    exp: Math.floor(now.getTime() / 1000) + 600,
  };

  it('reads the claims of a live token', () => {
    expect(readSupportTokenClaims(token(valid), now)).toEqual(valid);
  });

  it('rejects expired, incomplete and malformed tokens', () => {
    expect(
      readSupportTokenClaims(
        token({ ...valid, exp: Math.floor(now.getTime() / 1000) }),
        now,
      ),
    ).toBeNull();
    expect(
      readSupportTokenClaims(token({ ...valid, sub: undefined }), now),
    ).toBeNull();
    expect(
      readSupportTokenClaims(token({ ...valid, exp: 'soon' }), now),
    ).toBeNull();
    expect(
      readSupportTokenClaims(token({ ...valid, exp: null }), now),
    ).toBeNull();
    expect(readSupportTokenClaims('a.b', now)).toBeNull();
    expect(readSupportTokenClaims('a..c', now)).toBeNull();
    expect(readSupportTokenClaims('a.!!!.c', now)).toBeNull();
    expect(readSupportTokenClaims(`a.${encode('text')}.c`, now)).toBeNull();
    expect(readSupportTokenClaims(`a.${encode(null)}.c`, now)).toBeNull();
  });
});
