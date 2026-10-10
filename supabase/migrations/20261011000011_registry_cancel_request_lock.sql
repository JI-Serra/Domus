-- M02-F04: request locking requires only the existing request UPDATE capability.
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.cancel_unit_join_request(target_unit_join_request_id uuid,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id(); request public.unit_join_request; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_unit_join_request_id);
begin
  if actor is null or app_private.is_impersonating() or client_event_id is null then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  -- Only an owned request in a writable tenant can be read or locked. Applicants need no membership.
  select r.* into request from public.unit_join_request r join public.tenant t using(tenant_id)
    where r.unit_join_request_id=target_unit_join_request_id and r.unit_join_request_user_id=actor
      and t.tenant_subscription_status in('pilot','active') for update of r;
  if not found then raise exception 'Join request management denied' using errcode='42501'; end if;
  receipt:=app_private.registry_retry(client_event_id,request.tenant_id,'cancel_unit_join_request',payload);
  if receipt is not null then return receipt; end if;
  if request.unit_join_request_status<>'pending' then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  update public.unit_join_request set unit_join_request_status='cancelled',unit_join_request_decided_at=statement_timestamp(),
    unit_join_request_decided_by_user_id=actor where unit_join_request_id=target_unit_join_request_id;
  receipt:=jsonb_build_object('status','cancelled');
  perform app_private.registry_finish(client_event_id,request.tenant_id,'cancel_unit_join_request',payload,receipt);
  return receipt;
exception when insufficient_privilege then
  raise exception 'Join request management denied' using errcode='42501';
end;
$$;

reset role;
revoke create on schema public from registry_writer;
