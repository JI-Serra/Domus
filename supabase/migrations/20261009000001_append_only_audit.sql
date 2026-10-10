-- M00-F06: immutable history. Historical IDs deliberately have no FK: deleting
-- source identities must neither delete audit events nor prevent source deletion.
create table public.audit_event (
  audit_event_id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  audit_event_actor_user_id uuid,
  audit_event_actor_person_id uuid,
  audit_event_action text not null,
  audit_event_table_name text not null,
  audit_event_row_id uuid not null,
  audit_event_diff jsonb not null,
  audit_event_occurred_at timestamptz not null default now(),
  audit_event_request_ip text,
  audit_event_request_device text,
  constraint audit_event_action_check check (audit_event_action in ('insert', 'update', 'delete')),
  constraint audit_event_diff_object_check check (jsonb_typeof(audit_event_diff) = 'object'),
  constraint audit_event_actor_tenant_check check (audit_event_actor_person_id is null or tenant_id is not null)
);
create index audit_event_tenant_id_idx on public.audit_event(tenant_id);
create index audit_event_actor_user_id_idx on public.audit_event(audit_event_actor_user_id);
create index audit_event_actor_person_id_idx on public.audit_event(audit_event_actor_person_id);
create index audit_event_table_name_row_id_idx on public.audit_event(audit_event_table_name, audit_event_row_id);
alter table public.audit_event enable row level security;
revoke all on public.audit_event from public, anon, authenticated;
grant select on public.audit_event to authenticated;
create policy "audit admins can read tenant audit events" on public.audit_event for select to authenticated
  using ((select app_private.is_platform_admin()) or app_private.has_admin_permission(tenant_id, 'access_audit'));

create function app_private.protect_audit_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and pg_trigger_depth() > 1 then
    return new;
  end if;
  raise exception 'Audit events are append-only and inserted by audit triggers' using errcode = '42501';
end;
$$;
create trigger protect_audit_event before insert or update or delete on public.audit_event
  for each row execute function app_private.protect_audit_event();
create trigger protect_audit_event_truncate before truncate on public.audit_event
  for each statement execute function app_private.protect_audit_event();

-- Attach as an AFTER INSERT OR UPDATE OR DELETE row trigger to future sensitive
-- public tables. Requires a UUID <table>_id; tenant_id is optional for platform
-- tables. Updates store only changed keys as {column: {old, new}}; insert/delete
-- store the full new/old row. Writes and their audit event commit atomically.
-- Request metadata is untrusted context, never an authorization input.
create function app_private.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_data jsonb;
  new_data jsonb;
  row_data jsonb;
  changes jsonb;
  target_tenant_id uuid;
  actor_user_id uuid := (select auth.uid());
  actor_person_id uuid;
  headers jsonb;
begin
  if tg_op <> 'INSERT' then old_data := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_data := to_jsonb(new); end if;
  row_data := coalesce(new_data, old_data);
  target_tenant_id := (row_data ->> 'tenant_id')::uuid;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', old_data -> n.key, 'new', n.value)), '{}'::jsonb)
      into changes from jsonb_each(new_data) n where n.value is distinct from old_data -> n.key;
    if changes = '{}'::jsonb then return new; end if;
  else
    changes := row_data;
  end if;
  select p.person_id into actor_person_id from public.person p
    where p.tenant_id = target_tenant_id and p.user_id = actor_user_id;
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_actor_person_id,
    audit_event_action, audit_event_table_name, audit_event_row_id, audit_event_diff,
    audit_event_request_ip, audit_event_request_device
  ) values (
    target_tenant_id, actor_user_id, actor_person_id, lower(tg_op), tg_table_name,
    (row_data ->> (tg_table_name || '_id'))::uuid, changes,
    left(headers ->> 'x-forwarded-for', 256), left(headers ->> 'x-device-id', 256)
  );
  return coalesce(new, old);
end;
$$;
comment on function app_private.audit_row_change() is
  'Attach AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW to sensitive tables; requires UUID <table>_id, optional tenant_id. Request metadata is untrusted.';

create trigger audit_row_change after insert or update or delete on public.tenant
  for each row execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.platform_admin
  for each row execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.person
  for each row execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.membership
  for each row execute function app_private.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.membership_permission
  for each row execute function app_private.audit_row_change();
revoke all on function app_private.audit_row_change(), app_private.protect_audit_event() from public, anon, authenticated;
