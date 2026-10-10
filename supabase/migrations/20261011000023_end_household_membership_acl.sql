-- Apply the explicit RPC ACL as the owning capability role.
set role registry_writer;
revoke all on function public.end_household_membership(uuid,uuid) from public,anon,service_role;
grant execute on function public.end_household_membership(uuid,uuid) to authenticated;
reset role;
