-- M02-F04: abuse audit writer validates tenant through the audit FK without new tenant-read authority.
grant create on schema app_private to audit_writer;
set role audit_writer;
create or replace function app_private.record_join_code_abuse(target_tenant_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not app_private.current_identity_is_valid() or app_private.is_impersonating() then return; end if;
  if not app_private.consume_registry_attempt('join:alert:'||target_tenant_id::text,1) then return; end if;
  begin
    insert into public.audit_event(tenant_id,audit_event_actor_user_id,audit_event_db_role,audit_event_action,audit_event_table_name,audit_event_row_id,audit_event_diff)
      values(target_tenant_id,app_private.current_actor_user_id(),'authenticated','insert','join_code_bruteforce_suspected',target_tenant_id,'{}');
  exception when foreign_key_violation then return;
  end;
end;
$$;
reset role;
revoke create on schema app_private from audit_writer;
