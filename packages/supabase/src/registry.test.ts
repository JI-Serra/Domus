import { describe, expect, it, vi } from 'vitest';
import type { DomusSupabaseClient } from './types';
import {
  saveUnit,
  setHouseholdPermissions,
  sendResidentInvitation,
  unitSheet,
  redeemDevicePairing,
  submitUnitJoinRequest,
  myUnitJoinRequests,
  cancelUnitJoinRequest,
  registryPendingVerification,
  endHouseholdMembership,
  listTenantGuards,
} from './registry';
const id = '10000000-0000-0000-0000-000000000001';
describe('registry typed caller-bound wrappers', () => {
  it('lists the minimized guard projection within the requested tenant', () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as DomusSupabaseClient;
    listTenantGuards(client, { target_tenant_id: id });
    expect(rpc).toHaveBeenCalledWith('list_tenant_guards', {
      target_tenant_id: id,
    });
  });
  it('ends a household membership with the caller retry event', () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as DomusSupabaseClient;
    const input = { target_membership_id: id, client_event_id: id };
    endHouseholdMembership(client, input);
    expect(rpc).toHaveBeenCalledWith('end_household_membership', input);
  });
  it('passes the tenant to the registry-only verification queue', () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as DomusSupabaseClient;
    registryPendingVerification(client, { target_tenant_id: id });
    expect(rpc).toHaveBeenCalledWith('registry_pending_verification', {
      target_tenant_id: id,
    });
  });
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
  it('submits without a tenant and lists or cancels with caller-bound arguments', () => {
    const rpc = vi.fn();
    const client = { rpc } as unknown as DomusSupabaseClient;
    const input = {
      join_code: 'ABCD-EFGH-JKLM',
      person_data: {},
      client_event_id: id,
    };
    submitUnitJoinRequest(client, input);
    expect(rpc).toHaveBeenLastCalledWith('submit_unit_join_request', input);
    myUnitJoinRequests(client);
    expect(rpc).toHaveBeenLastCalledWith('my_unit_join_requests');
    const cancellation = {
      target_unit_join_request_id: id,
      client_event_id: id,
    };
    cancelUnitJoinRequest(client, cancellation);
    expect(rpc).toHaveBeenLastCalledWith(
      'cancel_unit_join_request',
      cancellation,
    );
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
