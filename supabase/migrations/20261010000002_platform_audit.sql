-- M01-F04: audit capture for the platform tables, attributed support writes and consent events. The dedicated
-- audit_writer owns every function that appends to audit_event; each is written here as a complete definition.
grant create on schema app_private to audit_writer;
set role audit_writer;
create or replace function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb; new_data jsonb; row_data jsonb; changes jsonb;
  target_tenant_id uuid; actor_user_id uuid := (select app_private.current_actor_user_id()); actor_person_id uuid;
  headers jsonb; redacted_columns text[]; redacted_column text;
  originating_role text := coalesce(nullif(nullif(current_setting('role', true), 'none'), ''), session_user);
  authorized boolean := false;
begin
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data := to_jsonb(new); end if;
  row_data := coalesce(new_data, old_data);
  target_tenant_id := (row_data ->> 'tenant_id')::uuid;
  if originating_role in ('postgres', 'supabase_admin', 'service_role') then authorized := true;
  elsif originating_role = 'authenticated' then
    case tg_table_name
      when 'tenant' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('tenant_settings'));
      when 'platform_admin' then authorized := (select app_private.is_platform_admin());
      when 'person' then authorized := target_tenant_id in (select app_private.permission_tenant_ids('registry'));
      when 'membership' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('admin_management'))
        or target_tenant_id in (select app_private.permission_tenant_ids('registry'));
      when 'membership_permission' then authorized := (select app_private.is_platform_admin())
        or target_tenant_id in (select app_private.permission_tenant_ids('admin_management'));
      when 'invitation' then authorized := app_private.can_invite(target_tenant_id, (row_data->>'invitation_membership_role')::public.membership_role, array(select jsonb_array_elements_text(row_data->'invitation_admin_permissions'))::public.admin_permission[]);
      when 'support_session' then authorized := app_private.is_platform_admin() or app_private.current_support_session_id() = (row_data->>'support_session_id')::uuid;
      else authorized := false;
    end case;
  end if;
  if originating_role = 'authenticated' and tg_table_name = 'tenant' and tg_op = 'UPDATE'
    and (new_data -> 'tenant_slug' is distinct from old_data -> 'tenant_slug'
      or new_data -> 'tenant_subscription_status' is distinct from old_data -> 'tenant_subscription_status')
    and not (select app_private.is_platform_admin()) then authorized := false; end if;
  if not coalesce(authorized, false) then
    raise exception 'Audited write denied' using errcode = '42501';
  end if;
  redacted_columns := app_private.audit_redacted_columns(tg_table_name);
  if redacted_columns is null then
    raise exception 'Declare audit redaction before attaching a sensitive table' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', old_data -> n.key, 'new', n.value)), '{}'::jsonb)
      into changes from jsonb_each(new_data) n where n.value is distinct from old_data -> n.key;
    if changes = '{}'::jsonb then return new; end if;
  else changes := row_data;
  end if;
  foreach redacted_column in array redacted_columns loop
    if changes ? redacted_column then
      changes := jsonb_set(changes, array[redacted_column], '{"changed":true}'::jsonb);
    end if;
  end loop;
  select p.person_id into actor_person_id from public.person p
    where p.tenant_id = target_tenant_id and p.user_id = actor_user_id;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_actor_person_id, audit_event_db_role,
    audit_event_action, audit_event_table_name, audit_event_row_id, audit_event_diff,
    audit_event_request_ip, audit_event_request_device, audit_event_on_behalf_of_user_id, support_session_id
  ) values (
    target_tenant_id, actor_user_id, actor_person_id, originating_role,
    lower(tg_op)::public.audit_event_action, tg_table_name, (row_data ->> (tg_table_name || '_id'))::uuid, changes,
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256),
    case when tg_table_name='support_session' then (row_data->>'support_session_target_user_id')::uuid when app_private.is_impersonating() then app_private.current_user_id() end, case when tg_table_name='support_session' then (row_data->>'support_session_id')::uuid else app_private.current_support_session_id() end
  );
  return coalesce(new, old);
end;
$$;
reset role;
revoke create on schema app_private from audit_writer;

create function app_private.audit_invitation_acceptance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb; new_data jsonb; row_data jsonb; changes jsonb;
  target_tenant_id uuid; actor_user_id uuid := (select app_private.current_actor_user_id()); actor_person_id uuid;
  headers jsonb; redacted_columns text[]; redacted_column text;
  originating_role text := coalesce(nullif(nullif(current_setting('role', true), 'none'), ''), session_user);
  authorized boolean := false;
begin
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data := to_jsonb(new); end if;
  row_data := coalesce(new_data, old_data);
  target_tenant_id := (row_data ->> 'tenant_id')::uuid;
  -- Trigger WHEN is evaluated as the exclusive invitation_acceptor invoker.
  if tg_name <> 'audit_invitation_acceptance' then raise exception 'Audited write denied' using errcode='42501'; end if;
  redacted_columns := app_private.audit_redacted_columns(tg_table_name);
  if redacted_columns is null then
    raise exception 'Declare audit redaction before attaching a sensitive table' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', old_data -> n.key, 'new', n.value)), '{}'::jsonb)
      into changes from jsonb_each(new_data) n where n.value is distinct from old_data -> n.key;
    if changes = '{}'::jsonb then return new; end if;
  else changes := row_data;
  end if;
  foreach redacted_column in array redacted_columns loop
    if changes ? redacted_column then
      changes := jsonb_set(changes, array[redacted_column], '{"changed":true}'::jsonb);
    end if;
  end loop;
  select p.person_id into actor_person_id from public.person p
    where p.tenant_id = target_tenant_id and p.user_id = actor_user_id;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_actor_person_id, audit_event_db_role,
    audit_event_action, audit_event_table_name, audit_event_row_id, audit_event_diff,
    audit_event_request_ip, audit_event_request_device, audit_event_on_behalf_of_user_id, support_session_id
  ) values (
    target_tenant_id, actor_user_id, actor_person_id, originating_role,
    lower(tg_op)::public.audit_event_action, tg_table_name, (row_data ->> (tg_table_name || '_id'))::uuid, changes,
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256),
    case when app_private.is_impersonating() then app_private.current_user_id() end, app_private.current_support_session_id()
  );
  return coalesce(new, old);
end;
$$;
revoke all on function app_private.audit_invitation_acceptance() from public,anon,authenticated,service_role;
grant create on schema app_private to audit_writer;
alter function app_private.audit_invitation_acceptance() owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.audit_invitation_acceptance() to postgres;
reset role;

-- Audit entry point for the support target lookup. Callable only by the owner of the public RPC. The search TERM is
-- never stored, only its length.
create function app_private.record_support_target_lookup(
  actor_user_id uuid, lookup_tenant_id uuid, search_length integer, result_count integer) returns void
language plpgsql security definer set search_path = '' as $$
declare headers jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_db_role, audit_event_action, audit_event_table_name,
    audit_event_row_id, audit_event_diff, audit_event_request_ip, audit_event_request_device
  ) values (
    lookup_tenant_id, actor_user_id, 'authenticated', 'insert', 'support_target_lookup', gen_random_uuid(),
    jsonb_build_object('support_target_lookup_search_length', search_length,
      'support_target_lookup_result_count', result_count),
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256));
end;
$$;
revoke all on function app_private.record_support_target_lookup(uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant create on schema app_private to audit_writer;
alter function app_private.record_support_target_lookup(uuid, uuid, integer, integer) owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.record_support_target_lookup(uuid, uuid, integer, integer) to postgres;
reset role;

-- Conditional triggers transfer the audited consent capability without granting
-- INSERT on audit_event or impersonating a privileged database request role.
drop trigger audit_row_change on public.person;
drop trigger audit_row_change on public.membership;
drop trigger audit_row_change on public.membership_permission;
create trigger audit_row_change after insert or update or delete on public.person
  for each row when (current_user <> 'invitation_acceptor') execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.membership
  for each row when (current_user <> 'invitation_acceptor') execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.membership_permission
  for each row when (current_user <> 'invitation_acceptor') execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.invitation
  for each row when (current_user <> 'invitation_acceptor') execute function app_private.audit_row_change();
create trigger audit_invitation_acceptance after insert or update or delete on public.person
  for each row when (current_user = 'invitation_acceptor') execute function app_private.audit_invitation_acceptance();
create trigger audit_invitation_acceptance after insert or update or delete on public.membership
  for each row when (current_user = 'invitation_acceptor') execute function app_private.audit_invitation_acceptance();
create trigger audit_invitation_acceptance after insert or update or delete on public.membership_permission
  for each row when (current_user = 'invitation_acceptor') execute function app_private.audit_invitation_acceptance();
create trigger audit_invitation_acceptance after insert or update or delete on public.invitation
  for each row when (current_user = 'invitation_acceptor') execute function app_private.audit_invitation_acceptance();
-- Capture end attribution while the prior session is still live; rollback remains atomic.
create trigger audit_row_change before insert or update or delete on public.support_session
  for each row execute function app_private.audit_row_change();
alter table public.person enable always trigger audit_row_change;
alter table public.membership enable always trigger audit_row_change;
alter table public.membership_permission enable always trigger audit_row_change;
alter table public.invitation enable always trigger audit_row_change;
alter table public.support_session enable always trigger audit_row_change;
alter table public.person enable always trigger audit_invitation_acceptance;
alter table public.membership enable always trigger audit_invitation_acceptance;
alter table public.membership_permission enable always trigger audit_invitation_acceptance;
alter table public.invitation enable always trigger audit_invitation_acceptance;

create trigger maintain_row_metadata before insert or update on public.invitation for each row execute function app_private.maintain_row_metadata();
create trigger maintain_row_metadata before insert or update on public.support_session for each row execute function app_private.maintain_row_metadata();
alter table public.invitation enable always trigger maintain_row_metadata;
alter table public.support_session enable always trigger maintain_row_metadata;
