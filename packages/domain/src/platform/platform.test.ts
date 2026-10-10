import { describe, expect, it } from 'vitest';
import {
  acceptInvitationSchema,
  billableUnitStatusesSchema,
  createTenantSchema,
  endSupportSessionSchema,
  sendInvitationSchema,
  startSupportSessionSchema,
} from './index';

const id = '10000000-0000-0000-0000-000000000001';
describe('platform input contracts', () => {
  it('validates tenant defaults and rejects invalid time zones and slugs', () => {
    expect(
      createTenantSchema.parse({
        tenant_name: ' Test ',
        tenant_slug: 'test',
        client_event_id: id,
      }).tenant_name,
    ).toBe('Test');
    expect(
      createTenantSchema.safeParse({
        tenant_name: 'Test',
        tenant_slug: 'Bad Slug',
        client_event_id: id,
      }).success,
    ).toBe(false);
    expect(
      createTenantSchema.safeParse({
        tenant_name: 'Test',
        tenant_slug: 'test',
        tenant_time_zone: 'Invalid/Zone',
        client_event_id: id,
      }).success,
    ).toBe(false);
  });
  it('requires invitation identity and reserves permission grants for admins', () => {
    const input = {
      target_tenant_id: id,
      invited_email: 'USER@example.com',
      target_role: 'guard',
      first_name: 'A',
      last_name: 'B',
      client_event_id: id,
    };
    expect(sendInvitationSchema.parse(input).invited_email).toBe(
      'user@example.com',
    );
    expect(
      sendInvitationSchema.safeParse({ ...input, first_name: undefined })
        .success,
    ).toBe(false);
    expect(
      sendInvitationSchema.safeParse({
        ...input,
        admin_permissions: ['finance'],
      }).success,
    ).toBe(false);
    expect(
      sendInvitationSchema.safeParse({
        ...input,
        target_person_id: id,
        first_name: undefined,
        last_name: undefined,
      }).success,
    ).toBe(true);
    expect(
      sendInvitationSchema.safeParse({
        ...input,
        target_role: 'tenant_admin',
        admin_permissions: ['finance'],
      }).success,
    ).toBe(true);
  });
  it('bounds support duration and requires a reason', () => {
    const input = {
      target_tenant_id: id,
      target_user_id: id,
      reason: 'Support',
      client_event_id: id,
    };
    expect(startSupportSessionSchema.parse(input).duration_minutes).toBe(30);
    expect(
      startSupportSessionSchema.safeParse({ ...input, duration_minutes: 60 })
        .success,
    ).toBe(true);
    expect(
      startSupportSessionSchema.safeParse({ ...input, duration_minutes: 61 })
        .success,
    ).toBe(false);
    expect(
      startSupportSessionSchema.safeParse({ ...input, reason: ' ' }).success,
    ).toBe(false);
    expect(
      endSupportSessionSchema.safeParse({ target_support_session_id: id })
        .success,
    ).toBe(true);
  });
  it('requires fixed-length invitation secrets and unique billable statuses', () => {
    expect(
      acceptInvitationSchema.safeParse({ token: 'a'.repeat(64) }).success,
    ).toBe(true);
    expect(acceptInvitationSchema.safeParse({ token: 'invalid' }).success).toBe(
      false,
    );
    expect(
      billableUnitStatusesSchema.safeParse(['occupied', 'vacant']).success,
    ).toBe(true);
    expect(
      billableUnitStatusesSchema.safeParse(['occupied', 'occupied']).success,
    ).toBe(false);
  });
});
