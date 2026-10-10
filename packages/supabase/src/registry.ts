import type { Database } from './database.types';
import type { DomusSupabaseClient } from './types';

type Args<Name extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][Name]['Args'];
export type RegistryRow<Name extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][Name]['Row'];
export type UnitSheet = {
  unit: RegistryRow<'unit'>;
  residents: (RegistryRow<'unit_resident'> &
    Partial<Omit<RegistryRow<'person'>, 'user_id'>>)[];
  vehicles: RegistryRow<'vehicle'>[];
  pets: RegistryRow<'pet'>[];
  memberships: RegistryRow<'membership'>[];
  pending_invitations: Omit<
    RegistryRow<'invitation'>,
    'invitation_token_hash'
  >[];
  pending_join_requests: RegistryRow<'unit_join_request'>[];
  permissions: Database['public']['Enums']['household_permission'][];
  movements: unknown[];
  authorizations?: unknown[];
  balance?: null;
};

export const saveUnit = (
  client: DomusSupabaseClient,
  input: Args<'save_unit'>,
) => client.rpc('save_unit', input);
export const archiveUnit = (
  client: DomusSupabaseClient,
  input: Args<'archive_unit'>,
) => client.rpc('archive_unit', input);
export const billableUnitCount = (
  client: DomusSupabaseClient,
  input: Args<'billable_unit_count'>,
) => client.rpc('billable_unit_count', input);
export const saveResident = (
  client: DomusSupabaseClient,
  input: Args<'save_resident'>,
) => client.rpc('save_resident', input);
export const saveVehicle = (
  client: DomusSupabaseClient,
  input: Args<'save_vehicle'>,
) => client.rpc('save_vehicle', input);
export const savePet = (client: DomusSupabaseClient, input: Args<'save_pet'>) =>
  client.rpc('save_pet', input);
export const setHouseholdPermissions = (
  client: DomusSupabaseClient,
  input: Args<'set_household_permissions'>,
) => client.rpc('set_household_permissions', input);
export const currentHouseholdPermissions = (
  client: DomusSupabaseClient,
  input: Args<'current_household_permissions'>,
) => client.rpc('current_household_permissions', input);
export const sendResidentInvitation = (
  client: DomusSupabaseClient,
  input: Args<'create_resident_invitation'>,
) =>
  client.functions.invoke<{ invitation_id: string }>('send-invitation', {
    body: input,
  });
export const revokeResidentInvitation = (
  client: DomusSupabaseClient,
  input: Args<'revoke_resident_invitation'>,
) => client.rpc('revoke_resident_invitation', input);
export const rotateUnitJoinCode = (
  client: DomusSupabaseClient,
  input: Args<'rotate_unit_join_code'>,
) => client.rpc('rotate_unit_join_code', input);
export const submitUnitJoinRequest = (
  client: DomusSupabaseClient,
  input: Args<'submit_unit_join_request'>,
) => client.rpc('submit_unit_join_request', input);
export const decideUnitJoinRequest = (
  client: DomusSupabaseClient,
  input: Args<'decide_unit_join_request'>,
) => client.rpc('decide_unit_join_request', input);
export const saveGate = (
  client: DomusSupabaseClient,
  input: Args<'save_gate'>,
) => client.rpc('save_gate', input);
export const assignGuardGate = (
  client: DomusSupabaseClient,
  input: Args<'assign_guard_gate'>,
) => client.rpc('assign_guard_gate', input);
export const createDevicePairing = (
  client: DomusSupabaseClient,
  input: Args<'create_device_pairing'>,
) => client.rpc('create_device_pairing', input);
export const redeemDevicePairing = (
  client: DomusSupabaseClient,
  input: Args<'redeem_device_pairing'>,
) => client.rpc('redeem_device_pairing', input);
export const syncDevice = (
  client: DomusSupabaseClient,
  input: Args<'sync_device'>,
) => client.rpc('sync_device', input);
export const revokeDevice = (
  client: DomusSupabaseClient,
  input: Args<'revoke_device'>,
) => client.rpc('revoke_device', input);
export const guardRegistry = (
  client: DomusSupabaseClient,
  input: Args<'guard_registry'>,
) => client.rpc('guard_registry', input);
export const guardBackupContact = (
  client: DomusSupabaseClient,
  input: Args<'guard_backup_contact'>,
) => client.rpc('guard_backup_contact', input);
export const createRegistryImport = (
  client: DomusSupabaseClient,
  input: Args<'create_registry_import'>,
) => client.rpc('create_registry_import', input);
export const previewRegistryImport = (
  client: DomusSupabaseClient,
  input: Args<'preview_registry_import'>,
) => client.rpc('preview_registry_import', input);
export const confirmRegistryImport = (
  client: DomusSupabaseClient,
  input: Args<'confirm_registry_import'>,
) => client.rpc('confirm_registry_import', input);
export const searchRegistry = (
  client: DomusSupabaseClient,
  input: Args<'search_registry'>,
) => client.rpc('search_registry', input);
export const unitSheet = (
  client: DomusSupabaseClient,
  input: Args<'unit_sheet'>,
) =>
  client.rpc('unit_sheet', input).overrideTypes<UnitSheet, { merge: false }>();
