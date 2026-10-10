
-- Dedicated, non-inheritable capabilities: no client/service membership in either role.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'audit_writer') then create role audit_writer nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'audit_purger') then create role audit_purger nologin noinherit; end if;
end;
$$;
grant audit_writer, audit_purger to postgres with inherit false, set true;
grant usage on schema public, app_private to audit_writer;
grant usage on schema public, app_private to audit_purger;
create type public.audit_event_action as enum ('insert', 'update', 'delete');
create table public.audit_event (
  audit_event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  audit_event_actor_user_id uuid,
  audit_event_actor_person_id uuid,
  audit_event_db_role text not null,
  audit_event_action public.audit_event_action not null,
  audit_event_table_name text not null,
  audit_event_row_id uuid not null,
  audit_event_diff jsonb not null,
  audit_event_occurred_at timestamptz not null default now(),
  audit_event_request_ip text,
  audit_event_request_device text,
  constraint audit_event_diff_object_check check (jsonb_typeof(audit_event_diff) = 'object'),
  constraint audit_event_actor_tenant_check check (audit_event_actor_person_id is null or tenant_id is not null)
);
create index audit_event_tenant_id_idx on public.audit_event(tenant_id);
create index audit_event_actor_user_id_idx on public.audit_event(audit_event_actor_user_id);
create index audit_event_actor_person_id_idx on public.audit_event(audit_event_actor_person_id);
create index audit_event_table_name_row_id_idx on public.audit_event(audit_event_table_name, audit_event_row_id);
alter table public.audit_event enable row level security;
revoke all on public.audit_event from public, anon, authenticated, service_role;
grant select on public.audit_event to authenticated;
grant insert on public.audit_event to audit_writer;
grant select, delete on public.audit_event to audit_purger;
create policy "audit admins can read tenant audit events" on public.audit_event for select to authenticated
  using ((select app_private.is_platform_admin()) or tenant_id in (select app_private.permission_tenant_ids('access_audit')));
create policy "audit writer can append events" on public.audit_event for insert to audit_writer with check (true);
create policy "audit purger can read retained events" on public.audit_event for select to audit_purger using (true);
create policy "audit purger can delete expired events" on public.audit_event for delete to audit_purger using (true);

create function app_private.protect_audit_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and current_user = 'audit_writer' then return new; end if;
  if tg_op = 'DELETE' and current_user = 'audit_purger' then return old; end if;
  raise exception 'Audit writes require the dedicated writer or retention purger' using errcode = '42501';
end;
$$;
create trigger protect_audit_event before insert or update or delete on public.audit_event
  for each row execute function app_private.protect_audit_event();
create trigger protect_audit_event_truncate before truncate on public.audit_event
  for each statement execute function app_private.protect_audit_event();
alter table public.audit_event enable always trigger protect_audit_event;
alter table public.audit_event enable always trigger protect_audit_event_truncate;

-- Audit may resolve only the current actor's person, not arbitrary tenant PII.
create function app_private.current_actor_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select (select auth.uid());
$$;
grant execute on function app_private.current_actor_user_id() to audit_writer;
grant select (tenant_id, person_id, user_id) on public.person to audit_writer;
create policy "audit writer can resolve own actor" on public.person for select to audit_writer
  using (tenant_id is not null and user_id = (select app_private.current_actor_user_id()));
grant execute on function app_private.permission_tenant_ids(public.admin_permission),
  app_private.is_platform_admin() to audit_writer;

-- Per-table redaction declarations are mandatory when attaching audit.
comment on table public.person is
  'Audit redaction: person_document_number, person_phone, person_birth_date. TODO M02-F04: invitation acceptance binds auth.uid().';
create function app_private.audit_redacted_columns(target_table text) returns text[]
language sql immutable set search_path = '' as $$
  select case target_table
    when 'person' then array['person_document_number', 'person_phone', 'person_birth_date']::text[]
    when 'tenant' then array[]::text[]
    when 'platform_admin' then array[]::text[]
    when 'membership' then array[]::text[]
    when 'membership_permission' then array[]::text[]
    else null::text[] end;
$$;
grant execute on function app_private.audit_redacted_columns(text) to audit_writer;

-- Caller authority is verified before resolving any actor or touching audit.
-- In an RPC, request.role remains the originating role while current_user is the
-- definer. Database role is retained separately from the optional acting user.
create function app_private.audit_row_change() returns trigger
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
    audit_event_request_ip, audit_event_request_device
  ) values (
    target_tenant_id, actor_user_id, actor_person_id, originating_role,
    lower(tg_op)::public.audit_event_action, tg_table_name, (row_data ->> (tg_table_name || '_id'))::uuid, changes,
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256)
  );
  return coalesce(new, old);
end;
$$;
revoke all on function app_private.audit_row_change() from public, anon, authenticated, service_role;
-- Required only when PostgreSQL creates the triggers; never grant client execute.
grant execute on function app_private.audit_row_change() to postgres;
comment on function app_private.audit_row_change() is
  'Dedicated audit_writer; authorize before actor lookup, declare redacted columns, attach AFTER ROW, ENABLE ALWAYS. Metadata is untrusted.';
grant create on schema app_private to audit_writer;
alter function app_private.audit_row_change() owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.audit_row_change() to postgres;
reset role;

do $$
declare table_name text;
begin
  foreach table_name in array array['tenant', 'platform_admin', 'person', 'membership', 'membership_permission'] loop
    execute format('create trigger audit_row_change after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()', table_name);
    execute format('alter table public.%I enable always trigger audit_row_change', table_name);
    execute format('revoke truncate, trigger, references on public.%I from service_role', table_name);
  end loop;
end;
$$;

-- Separate writer entry point, callable only by the retention role.
create function app_private.record_audit_purge(cutoff timestamptz, purged_count bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_event (audit_event_db_role, audit_event_action, audit_event_table_name,
    audit_event_row_id, audit_event_diff)
  values ('audit_purger', 'delete', 'audit_event', gen_random_uuid(),
    jsonb_build_object('audit_event_purged_count', purged_count, 'audit_event_before_at', cutoff));
$$;
revoke all on function app_private.record_audit_purge(timestamptz, bigint) from public, anon, authenticated, service_role;
grant execute on function app_private.record_audit_purge(timestamptz, bigint) to audit_purger;
grant create on schema app_private to audit_writer;
alter function app_private.record_audit_purge(timestamptz, bigint) owner to audit_writer;
revoke create on schema app_private from audit_writer;

create function app_private.purge_audit_events(before_at timestamptz) returns bigint
language plpgsql security definer set search_path = '' as $$
declare purged_count bigint;
begin
  if current_user <> 'audit_purger' then
    raise exception 'Audit retention role required' using errcode = '42501';
  end if;
  if before_at is null or before_at >= now() then
    raise exception 'Audit retention cutoff must be in the past' using errcode = '22023';
  end if;
  delete from public.audit_event where audit_event_occurred_at < before_at;
  get diagnostics purged_count = row_count;
  perform app_private.record_audit_purge(before_at, purged_count);
  return purged_count;
end;
$$;
revoke all on function app_private.purge_audit_events(timestamptz) from public, anon, authenticated, service_role;
grant execute on function app_private.purge_audit_events(timestamptz) to postgres;
comment on function app_private.purge_audit_events(timestamptz) is
  'Operator-only retention entry point executes as NOLOGIN audit_purger with a past cutoff. Purge volume is audited. No scheduler in H0.';
grant create on schema app_private to audit_purger;
alter function app_private.purge_audit_events(timestamptz) owner to audit_purger;
revoke create on schema app_private from audit_purger;
set role audit_purger;
grant execute on function app_private.purge_audit_events(timestamptz) to postgres;
reset role;
revoke all on function app_private.protect_audit_event() from public, anon, authenticated, service_role;
