-- M01-F04: preserve the dedicated audit writer and explicit redaction registry.
create or replace function app_private.current_actor_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select case when app_private.current_identity_is_valid() then
    case when app_private.is_impersonating() then ((select auth.jwt())->>'impersonator_user_id')::uuid
      else app_private.current_user_id() end end;
$$;
create or replace function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path = '' as $$
  select case target_table
    when 'person' then array['person_document_number','person_phone','person_birth_date']::text[]
    when 'tenant' then array[]::text[] when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[] when 'membership_permission' then array[]::text[]
    when 'invitation' then array['invitation_email','invitation_first_name','invitation_last_name','invitation_token_hash']::text[]
    when 'support_session' then array['support_session_reason']::text[] else null::text[] end;
$$;
grant execute on function app_private.current_identity_is_valid(),app_private.current_user_id(),
  app_private.current_support_session_id(),app_private.is_impersonating(),app_private.can_invite(uuid,public.membership_role,public.admin_permission[]) to audit_writer;
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
    case when app_private.is_impersonating() then app_private.current_user_id() end, app_private.current_support_session_id()
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
-- Conditional triggers transfer the audited consent capability without granting
-- INSERT on audit_event or impersonating a privileged database request role.
do $$ declare table_name text; begin
  foreach table_name in array array['person','membership','membership_permission'] loop
    execute format('drop trigger audit_row_change on public.%I',table_name);
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row when (current_user <> ''invitation_acceptor'') execute function app_private.audit_row_change()',table_name);
    execute format('create trigger audit_invitation_acceptance after insert or update or delete on public.%I for each row when (current_user = ''invitation_acceptor'') execute function app_private.audit_invitation_acceptance()',table_name);
    execute format('alter table public.%I enable always trigger audit_row_change',table_name);
    execute format('alter table public.%I enable always trigger audit_invitation_acceptance',table_name);
  end loop;
end $$;
create trigger audit_row_change after insert or update or delete on public.invitation
  for each row when (current_user <> 'invitation_acceptor') execute function app_private.audit_row_change();
create trigger audit_invitation_acceptance after insert or update or delete on public.invitation
  for each row when (current_user = 'invitation_acceptor') execute function app_private.audit_invitation_acceptance();
-- Capture end attribution while the prior session is still live; rollback remains atomic.
create trigger audit_row_change before insert or update or delete on public.support_session
  for each row execute function app_private.audit_row_change();
alter table public.invitation enable always trigger audit_row_change;
alter table public.invitation enable always trigger audit_invitation_acceptance;
alter table public.support_session enable always trigger audit_row_change;
create trigger maintain_row_metadata before insert or update on public.invitation for each row execute function app_private.maintain_row_metadata();
create trigger maintain_row_metadata before insert or update on public.support_session for each row execute function app_private.maintain_row_metadata();
alter table public.invitation enable always trigger maintain_row_metadata;
alter table public.support_session enable always trigger maintain_row_metadata;
revoke truncate,trigger,references on public.invitation,public.support_session from service_role;

create function app_private.writable_permission_tenant_ids(target_permission public.admin_permission) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t from app_private.permission_tenant_ids(target_permission) t where t in (select app_private.writable_tenant_ids());
$$;
-- Upgrade the frozen H0 management RPCs in a new migration: reject read-only
-- callers before target lookups/locks, retaining D17 target and grantor checks.
do $$ declare fn record; body text; begin
  for fn in select p.oid::regprocedure signature from pg_proc p where
    (p.pronamespace='public'::regnamespace and p.proname in ('create_membership','update_membership','revoke_membership','delete_membership','grant_admin_permission','revoke_admin_permission'))
    or p.oid='app_private.lock_managed_membership(uuid,boolean,public.membership_role)'::regprocedure loop
    body:=pg_get_functiondef(fn.signature);
    body:=replace(body,'app_private.permission_tenant_ids(', 'app_private.writable_permission_tenant_ids(');
    body:=replace(body,'(select auth.uid())','app_private.current_user_id()');
    execute body;
  end loop;
end $$;
revoke all on function app_private.writable_permission_tenant_ids(public.admin_permission) from public,anon,authenticated;
