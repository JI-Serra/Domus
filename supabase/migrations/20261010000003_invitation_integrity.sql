-- The invoker permission-validation trigger locks admin memberships. PostgreSQL
-- requires UPDATE capability and a matching policy even for SELECT FOR UPDATE.
-- This NOLOGIN role is reachable only through the consent RPC, never clients.
grant update(membership_role) on public.membership to invitation_acceptor;
create policy "invitation acceptor can lock granted memberships" on public.membership for update
  to invitation_acceptor using(true) with check(true);

drop index public.person_tenant_id_user_id_key;
alter table public.person add constraint person_tenant_id_user_id_key unique(tenant_id,user_id);
alter table public.support_session add constraint support_session_tenant_id_target_user_id_fkey
  foreign key(tenant_id,support_session_target_user_id) references public.person(tenant_id,user_id);
create index support_session_tenant_id_target_user_id_idx on public.support_session(tenant_id,support_session_target_user_id);

alter table public.tenant add column client_event_id uuid not null default gen_random_uuid();
alter table public.tenant add constraint tenant_client_event_id_key unique(client_event_id);
create or replace function public.create_tenant(tenant_name text, tenant_slug text, tenant_address text default null,
  tenant_time_zone text default 'America/Argentina/Tucuman',
  tenant_subscription_status public.tenant_subscription_status default 'pilot', tenant_logo_path text default null,
  client_event_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not app_private.is_platform_admin() then raise exception 'MFA platform administrator required' using errcode='42501'; end if;
  if tenant_name is null or length(btrim(tenant_name)) not between 1 and 200 or tenant_slug is null
    or tenant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=tenant_time_zone) then
    raise exception 'Invalid tenant input' using errcode='22023'; end if;
  created_id:=client_event_id;
  if tenant_logo_path is not null and tenant_logo_path not like created_id::text||'/%' then
    raise exception 'Invalid tenant logo path' using errcode='22023'; end if;
  insert into public.tenant(tenant_id,tenant_name,tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,tenant_settings,client_event_id)
  values(created_id,btrim(tenant_name),tenant_slug,tenant_address,tenant_time_zone,tenant_subscription_status,tenant_logo_path,
    '{"locale":"es-AR","currency":"ARS"}'::jsonb,client_event_id)
  on conflict on constraint tenant_client_event_id_key do nothing returning tenant_id into created_id;
  if created_id is null then
    select t.tenant_id into created_id from public.tenant t where t.client_event_id=create_tenant.client_event_id
      and t.tenant_slug=create_tenant.tenant_slug and t.tenant_name=btrim(create_tenant.tenant_name);
    if not found then raise exception 'Idempotency key conflict' using errcode='22023'; end if;
  end if;
  return created_id;
end;
$$;

-- Duplicate billing statuses have no semantic meaning; keep the array a set.
alter table public.tenant add constraint tenant_billable_unit_statuses_unique_check check (
  cardinality(array_positions(tenant_billable_unit_statuses,'occupied'))<=1
  and cardinality(array_positions(tenant_billable_unit_statuses,'under_construction'))<=1
  and cardinality(array_positions(tenant_billable_unit_statuses,'vacant'))<=1);

-- Fixed work for secret-hash comparison, including missing-record failures.
create function app_private.constant_time_hash_equal(left_hash text,right_hash text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare mismatch integer := 0;
begin
  if length(left_hash)<>64 or length(right_hash)<>64 then return false; end if;
  for position in 0..63 loop
    mismatch := mismatch | (ascii(substr(left_hash,position+1,1)) # ascii(substr(right_hash,position+1,1)));
  end loop;
  return mismatch=0;
end;
$$;
revoke all on function app_private.constant_time_hash_equal(text,text) from public,anon,authenticated;
grant execute on function app_private.constant_time_hash_equal(text,text) to invitation_acceptor;

-- Pending invitations cannot retain a revoked grantor's authority.
create function app_private.invitation_grant_is_valid(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare target public.invitation; required_permission public.admin_permission;
begin
  if app_private.verified_email() is null or app_private.is_impersonating() then return false; end if;
  select i.* into target from public.invitation i where i.invitation_id=target_invitation_id
    and i.invitation_email=app_private.verified_email() and i.invitation_status='pending';
  if not found then return false; end if;
  perform 1 from public.platform_admin a where a.user_id=target.invitation_created_by_user_id
    and a.platform_admin_is_active for share;
  if found then return true; end if;
  required_permission:=case when target.invitation_membership_role='tenant_admin'
    then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end;
  -- Hold current grantor authority through binding and permission inserts.
  perform 1 from public.membership m join public.person p using(tenant_id,person_id)
    join public.membership_permission mp using(tenant_id,membership_id)
  where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
    and m.membership_role='tenant_admin' and m.membership_status='active'
    and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
    and mp.membership_permission_admin_permission=required_permission for share of m,mp;
  if not found then return false; end if;
  return not exists(select 1 from unnest(target.invitation_admin_permissions) requested where not exists(
    select 1 from public.membership m join public.person p using(tenant_id,person_id)
      join public.membership_permission mp using(tenant_id,membership_id)
    where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
      and m.membership_role='tenant_admin' and m.membership_status='active'
      and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and mp.membership_permission_admin_permission=requested));
end;
$$;
revoke all on function app_private.invitation_grant_is_valid(uuid) from public,anon,authenticated;
grant execute on function app_private.invitation_grant_is_valid(uuid) to invitation_acceptor;
grant create on schema public to invitation_acceptor;
set role invitation_acceptor;
do $$ declare body text; begin
  body:=pg_get_functiondef('public.accept_invitation(text)'::regprocedure);
  body:=replace(body,'if not found then raise exception ''Invitation unavailable''',
    'if not app_private.constant_time_hash_equal(coalesce(target.invitation_token_hash,repeat(''0'',64)),encode(extensions.digest(token,''sha256''),''hex'')) or target.invitation_id is null then raise exception ''Invitation unavailable''');
  body:=replace(body,'-- Serializes same-user acceptance',
    'if not app_private.invitation_grant_is_valid(target.invitation_id) then raise exception ''Invitation unavailable'' using errcode=''42501''; end if;'||E'\n  -- Serializes same-user acceptance');
  execute body;
end $$;
reset role;
revoke create on schema public from invitation_acceptor;

-- One timestamp bounds the full requested duration even in a long transaction.
do $$ declare body text; begin
  body:=pg_get_functiondef('public.start_support_session(uuid,uuid,text,uuid,integer)'::regprocedure);
  body:=replace(body,'support_session_duration_minutes_count,support_session_expires_at,client_event_id)',
    'support_session_duration_minutes_count,support_session_started_at,support_session_expires_at,client_event_id)');
  body:=replace(body,'btrim(reason),duration_minutes,','btrim(reason),duration_minutes,statement_timestamp(),');
  execute body;
  body:=pg_get_functiondef('public.create_invitation(uuid,text,public.membership_role,text,timestamptz,uuid,uuid,text,text,public.admin_permission[])'::regprocedure);
  body:=replace(body,'and i.invitation_created_by_user_id=app_private.current_user_id();',
    'and i.invitation_created_by_user_id=app_private.current_user_id() and i.invitation_status=''pending'' and i.invitation_expires_at>statement_timestamp() and i.invitation_email=lower(btrim(invited_email)) and i.invitation_token_hash=token_hash and i.invitation_membership_role=target_role and i.invitation_admin_permissions=admin_permissions;');
  execute body;
end $$;

do $$ declare body text; begin
  body:=pg_get_functiondef('public.revoke_invitation(uuid)'::regprocedure);
  body:=replace(body,'declare target public.invitation;','');
  body:=replace(body,'select i.* into target from public.invitation i','perform 1 from public.invitation i');
  execute body;
end $$;
