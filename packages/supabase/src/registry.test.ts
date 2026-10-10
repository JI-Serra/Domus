import { describe, expect, it, vi } from 'vitest';
import type { DomusSupabaseClient } from './types';
import {
  saveUnit,
  setHouseholdPermissions,
  sendResidentInvitation,
  unitSheet,
  redeemDevicePairing,
} from './registry';
const id = '10000000-0000-0000-0000-000000000001';
describe('registry typed caller-bound wrappers', () => {
  it('preserves tenant, unit and retry arguments without credentials', () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as DomusSupabaseClient;
    const input = {
      target_tenant_id: id,
      unit_data: { unit_code: 'Mz 1' },
      client_event_id: id,
    };
    saveUnit(client, input);
    expect(rpc).toHaveBeenCalledWith('save_unit', input);
    setHouseholdPermissions(client, {
      target_tenant_id: id,
      target_unit_id: id,
      target_membership_id: id,
      permissions: ['view_unit_finance'],
      client_event_id: id,
    });
    expect(rpc).toHaveBeenLastCalledWith(
      'set_household_permissions',
      expect.objectContaining({ permissions: ['view_unit_finance'] }),
    );
    redeemDevicePairing(client, {
      target_tenant_id: id,
      pairing_code: 'code',
      device_name: 'Tablet',
    });
    expect(rpc).toHaveBeenLastCalledWith('redeem_device_pairing', {
      target_tenant_id: id,
      pairing_code: 'code',
      device_name: 'Tablet',
    });
  });
  it('uses the email endpoint for resident consent and generated rows for the sheet', () => {
    const invoke = vi.fn();
    const overrideTypes = vi.fn();
    const rpc = vi.fn(() => ({ overrideTypes }));
    const client = {
      functions: { invoke },
      rpc,
    } as unknown as DomusSupabaseClient;
    const input = {
      target_tenant_id: id,
      target_unit_id: id,
      target_person_id: id,
      invited_email: 'test@example.com',
      target_role: 'household_member' as const,
      client_event_id: id,
    };
    sendResidentInvitation(client, input);
    expect(invoke).toHaveBeenCalledWith('send-invitation', { body: input });
    unitSheet(client, { target_tenant_id: id, target_unit_id: id });
    expect(rpc).toHaveBeenCalledWith('unit_sheet', {
      target_tenant_id: id,
      target_unit_id: id,
    });
    expect(overrideTypes).toHaveBeenCalled();
  });
});
