-- M00-F05: tenant-scoped identities and membership-derived authorization.
alter default privileges for role postgres revoke execute on functions from public;
create schema app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create type public.membership_role as enum ('tenant_admin', 'guard', 'unit_holder', 'household_member');
create type public.membership_status as enum ('active', 'suspended', 'revoked');
create type public.admin_permission as enum (
  'registry', 'access_config', 'access_audit', 'communication', 'complaints',
  'amenities', 'finance', 'guards', 'tenant_settings', 'admin_management'
);
create type public.tenant_subscription_status as enum ('pilot', 'active', 'suspended', 'cancelled');
create type public.person_document_type as enum ('dni', 'passport', 'other');
create domain public.document_number as text check (length(value) between 1 and 32);
create domain public.phone_number as text check (length(value) between 1 and 32);

create table public.tenant (
  tenant_id uuid primary key default gen_random_uuid(),
  tenant_name text not null,
  tenant_slug text not null constraint tenant_tenant_slug_key unique,
  tenant_address text,
  tenant_time_zone text not null default 'America/Argentina/Tucuman',
  tenant_subscription_status public.tenant_subscription_status not null default 'pilot',
  tenant_settings jsonb not null default '{}'::jsonb,
  tenant_logo_path text,
  tenant_created_at timestamptz not null default now(),
  tenant_updated_at timestamptz not null default now(),
  constraint tenant_settings_object_check check (jsonb_typeof(tenant_settings) = 'object')
);
create table public.platform_admin (
  platform_admin_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  platform_admin_is_active boolean not null default true,
  platform_admin_created_at timestamptz not null default now(),
  platform_admin_updated_at timestamptz not null default now(),
  constraint platform_admin_user_id_key unique (user_id)
);
create table public.person (
  person_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(tenant_id),
  user_id uuid references auth.users(id),
  person_first_name text not null,
  person_last_name text not null,
  person_document_type public.person_document_type,
  person_document_number public.document_number,
  person_phone public.phone_number,
  person_birth_date date,
  person_created_at timestamptz not null default now(),
  person_updated_at timestamptz not null default now(),
  constraint person_tenant_id_person_id_key unique (tenant_id, person_id),
  constraint person_document_pair_check check ((person_document_type is null) = (person_document_number is null))
);
create unique index person_tenant_id_user_id_key on public.person(tenant_id, user_id) where user_id is not null;
create unique index person_tenant_id_person_document_type_person_document_number_key
  on public.person(tenant_id, person_document_type, person_document_number) where person_document_number is not null;
create index person_user_id_idx on public.person(user_id);
create table public.membership (
  membership_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(tenant_id),
  person_id uuid not null,
  membership_role public.membership_role not null,
  membership_status public.membership_status not null default 'active',
  membership_valid_from timestamptz not null default now(),
  membership_valid_to timestamptz,
  membership_created_at timestamptz not null default now(),
  membership_updated_at timestamptz not null default now(),
  constraint membership_tenant_id_person_id_fkey foreign key (tenant_id, person_id)
    references public.person(tenant_id, person_id),
  constraint membership_tenant_id_membership_id_key unique (tenant_id, membership_id),
  constraint membership_validity_check check (membership_valid_to is null or membership_valid_to > membership_valid_from)
);
comment on table public.membership is 'Unit relationships arrive in M02; intentionally no unit_id in H0.';
create index membership_person_id_idx on public.membership(person_id);
create index membership_tenant_id_person_id_idx on public.membership(tenant_id, person_id);
create table public.membership_permission (
  membership_permission_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(tenant_id),
  membership_id uuid not null,
  membership_permission_admin_permission public.admin_permission not null,
  membership_permission_created_at timestamptz not null default now(),
  membership_permission_updated_at timestamptz not null default now(),
  constraint membership_permission_tenant_id_membership_id_fkey foreign key (tenant_id, membership_id)
    references public.membership(tenant_id, membership_id),
  constraint membership_permission_tenant_id_membership_id_admin_permission_key
    unique (tenant_id, membership_id, membership_permission_admin_permission)
);
create index membership_permission_membership_id_idx on public.membership_permission(membership_id);


-- All authorization sets are uncorrelated subplans in RLS policies.
create function app_private.member_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
  where p.user_id = (select auth.uid()) and m.membership_status = 'active'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to);
$$;
create function app_private.role_tenant_ids(target_roles public.membership_role[]) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
  where p.user_id = (select auth.uid()) and m.membership_status = 'active'
    and m.membership_role = any(target_roles) and m.membership_valid_from <= now()
    and (m.membership_valid_to is null or now() < m.membership_valid_to);
$$;
create function app_private.permission_tenant_ids(target_permission public.admin_permission) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct m.tenant_id from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
    join public.membership_permission mp on (mp.tenant_id, mp.membership_id) = (m.tenant_id, m.membership_id)
  where p.user_id = (select auth.uid()) and m.membership_status = 'active' and m.membership_role = 'tenant_admin'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
    and mp.membership_permission_admin_permission = target_permission;
$$;
create function app_private.current_person_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select p.person_id from public.person p where p.user_id = (select auth.uid())
    and p.tenant_id in (select app_private.member_tenant_ids());
$$;
create function app_private.own_membership_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.membership_id from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
  where p.user_id = (select auth.uid()) and m.membership_status = 'active'
    and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to);
$$;
-- Scalar wrappers remain available to server RPCs; never call them per row in policies.
create function app_private.is_tenant_member(target_tenant_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select target_tenant_id in (select app_private.member_tenant_ids());
$$;
create function app_private.has_tenant_role(target_tenant_id uuid, target_roles public.membership_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select target_tenant_id in (select app_private.role_tenant_ids(target_roles));
$$;
create function app_private.has_admin_permission(target_tenant_id uuid, target_permission public.admin_permission) returns boolean
language sql stable security definer set search_path = '' as $$
  select target_tenant_id in (select app_private.permission_tenant_ids(target_permission));
$$;
create function app_private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal' = 'aal2', false)
    and exists (select 1 from public.platform_admin pa
      where pa.user_id = (select auth.uid()) and pa.platform_admin_is_active);
$$;

-- Invoker integrity triggers: callers must first pass grants/RPC authorization.
create function app_private.validate_admin_permission() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.membership m where m.tenant_id = new.tenant_id
    and m.membership_id = new.membership_id and m.membership_role = 'tenant_admin' for update;
  if not found then
    raise exception 'Permissions require a tenant admin membership' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_admin_permission before insert or update on public.membership_permission
  for each row execute function app_private.validate_admin_permission();
create function app_private.protect_membership_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.membership_role <> 'tenant_admin' and exists (
    select 1 from public.membership_permission mp where mp.membership_id = old.membership_id
  ) then
    raise exception 'Remove admin permissions before changing the membership role' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger protect_membership_role before update on public.membership
  for each row execute function app_private.protect_membership_role();

create function app_private.maintain_row_metadata() returns trigger
language plpgsql set search_path = '' as $$
declare row_data jsonb := to_jsonb(new);
begin
  if tg_op = 'UPDATE' then
    if row_data -> (tg_table_name || '_id') is distinct from to_jsonb(old) -> (tg_table_name || '_id')
      or row_data -> 'tenant_id' is distinct from to_jsonb(old) -> 'tenant_id'
      or (tg_table_name = 'membership' and row_data -> 'person_id' is distinct from to_jsonb(old) -> 'person_id')
      or (tg_table_name = 'membership_permission' and row_data -> 'membership_id' is distinct from to_jsonb(old) -> 'membership_id') then
      raise exception 'Row identity and relationships cannot change' using errcode = '23514';
    end if;
    row_data := row_data || jsonb_build_object(tg_table_name || '_created_at', to_jsonb(old) -> (tg_table_name || '_created_at'));
  else
    row_data := row_data || jsonb_build_object(tg_table_name || '_created_at', now());
  end if;
  row_data := row_data || jsonb_build_object(tg_table_name || '_updated_at', now());
  new := jsonb_populate_record(new, row_data);
  return new;
end;
$$;
-- TODO M02-F04: an invitation-acceptance RPC binds auth.uid() to its own person.
-- Clients cannot insert/update user_id, even by setting it to its current value.

do $$
declare table_name text;
begin
  foreach table_name in array array['tenant', 'platform_admin', 'person', 'membership', 'membership_permission'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create trigger maintain_row_metadata before insert or update on public.%I for each row execute function app_private.maintain_row_metadata()', table_name);
    execute format('alter table public.%I enable always trigger maintain_row_metadata', table_name);
  end loop;
end;
$$;
grant insert, delete on public.tenant to authenticated;
grant update (tenant_name, tenant_address, tenant_time_zone, tenant_settings, tenant_logo_path) on public.tenant to authenticated;
grant insert, update, delete on public.platform_admin to authenticated;
grant insert (person_id, tenant_id, person_first_name, person_last_name, person_document_type,
  person_document_number, person_phone, person_birth_date) on public.person to authenticated;
grant update (person_first_name, person_last_name, person_document_type, person_document_number,
  person_phone, person_birth_date) on public.person to authenticated;
grant delete on public.person to authenticated;

create policy "members and platform admins can read tenants" on public.tenant for select to authenticated
  using ((select app_private.is_platform_admin()) or tenant_id in (select app_private.member_tenant_ids()));
create policy "platform admins can insert tenants" on public.tenant for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy "settings admins can update tenants" on public.tenant for update to authenticated
  using ((select app_private.is_platform_admin()) or tenant_id in (select app_private.permission_tenant_ids('tenant_settings')))
  with check ((select app_private.is_platform_admin()) or tenant_id in (select app_private.permission_tenant_ids('tenant_settings')));
create policy "platform admins can delete tenants" on public.tenant for delete to authenticated
  using ((select app_private.is_platform_admin()));

create policy "MFA platform admins can read platform admins" on public.platform_admin for select to authenticated
  using ((select app_private.is_platform_admin()));
create policy "MFA platform admins can insert platform admins" on public.platform_admin for insert to authenticated
  with check ((select app_private.is_platform_admin()));
create policy "MFA platform admins can update platform admins" on public.platform_admin for update to authenticated
  using ((select app_private.is_platform_admin())) with check ((select app_private.is_platform_admin()));
create policy "MFA platform admins can delete platform admins" on public.platform_admin for delete to authenticated
  using ((select app_private.is_platform_admin()));

create policy "registry admins guards and owners can read people" on public.person for select to authenticated
  using (tenant_id in (select app_private.permission_tenant_ids('registry'))
    or tenant_id in (select app_private.role_tenant_ids(array['guard']::public.membership_role[]))
    or person_id in (select app_private.current_person_ids()));
create policy "registry admins can insert people" on public.person for insert to authenticated
  with check (tenant_id in (select app_private.permission_tenant_ids('registry')));
create policy "registry admins can update people" on public.person for update to authenticated
  using (tenant_id in (select app_private.permission_tenant_ids('registry')))
  with check (tenant_id in (select app_private.permission_tenant_ids('registry')));
create policy "registry admins can delete people" on public.person for delete to authenticated
  using (tenant_id in (select app_private.permission_tenant_ids('registry')));
create policy "registry managers and owners can read memberships" on public.membership for select to authenticated
  using (tenant_id in (select app_private.permission_tenant_ids('registry'))
    or tenant_id in (select app_private.permission_tenant_ids('admin_management'))
    or person_id in (select app_private.current_person_ids()));
create policy "registry managers can read membership permissions" on public.membership_permission for select to authenticated
  using (tenant_id in (select app_private.permission_tenant_ids('registry'))
    or tenant_id in (select app_private.permission_tenant_ids('admin_management')));
create policy "members can read own permissions" on public.membership_permission for select to authenticated
  using (membership_id in (select app_private.own_membership_ids()));
-- No membership/permission write policies or client grants. Role writes use RPCs.

-- Authorize the caller's capabilities before looking up any target, then scope
-- the target lookup before locking. Unauthorized and missing targets are identical.
create function app_private.lock_managed_membership(target_membership_id uuid, require_admin_management boolean,
  desired_role public.membership_role default null)
returns public.membership language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  if not (select app_private.is_platform_admin())
    and not exists (select app_private.permission_tenant_ids('admin_management'))
    and (require_admin_management or not exists (select app_private.permission_tenant_ids('registry'))) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  select m.* into target from public.membership m join public.person p
    on (p.tenant_id, p.person_id) = (m.tenant_id, m.person_id)
  where m.membership_id = target_membership_id and p.user_id is distinct from (select auth.uid())
    and ((select app_private.is_platform_admin())
      or ((m.membership_role = 'tenant_admin' or desired_role = 'tenant_admin' or require_admin_management)
        and m.tenant_id in (select app_private.permission_tenant_ids('admin_management')))
      or (not require_admin_management and m.membership_role <> 'tenant_admin' and desired_role is distinct from 'tenant_admin'::public.membership_role
        and m.tenant_id in (select app_private.permission_tenant_ids('registry'))))
    and (not require_admin_management or m.membership_role = 'tenant_admin')
  for update of m;
  if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  if not (select app_private.is_platform_admin()) then
    -- Hold the caller's management authority until the transaction completes.
    perform 1 from public.membership m join public.person p on (p.tenant_id,p.person_id)=(m.tenant_id,m.person_id)
      join public.membership_permission mp on (mp.tenant_id,mp.membership_id)=(m.tenant_id,m.membership_id)
    where m.tenant_id = target.tenant_id and p.user_id = (select auth.uid())
      and m.membership_role = 'tenant_admin' and m.membership_status = 'active'
      and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
      and mp.membership_permission_admin_permission = case
        when target.membership_role = 'tenant_admin' or desired_role = 'tenant_admin' or require_admin_management
          then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end
    for share of m, mp;
    if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  end if;
  return target;
end;
$$;
create function public.create_membership(target_person_id uuid, target_role public.membership_role,
  valid_from timestamptz default now(), valid_to timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target_tenant_id uuid; new_membership_id uuid;
begin
  if not (select app_private.is_platform_admin())
    and not exists (select app_private.permission_tenant_ids('admin_management'))
    and (target_role = 'tenant_admin' or not exists (select app_private.permission_tenant_ids('registry'))) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  select p.tenant_id into target_tenant_id from public.person p where p.person_id = target_person_id
    and p.user_id is distinct from (select auth.uid())
    and ((select app_private.is_platform_admin()) or p.tenant_id in (
      select app_private.permission_tenant_ids(case when target_role = 'tenant_admin' then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end)));
  if not found then raise exception 'Membership management denied' using errcode = '42501'; end if;
  insert into public.membership (tenant_id, person_id, membership_role, membership_valid_from, membership_valid_to)
    values (target_tenant_id, target_person_id, target_role, valid_from, valid_to) returning membership_id into new_membership_id;
  return new_membership_id;
end;
$$;
create function public.update_membership(target_membership_id uuid, target_role public.membership_role,
  target_status public.membership_status, valid_from timestamptz, valid_to timestamptz default null) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, false, target_role);
  if (target.membership_role = 'tenant_admin' or target_role = 'tenant_admin')
    and not (select app_private.is_platform_admin())
    and target.tenant_id not in (select app_private.permission_tenant_ids('admin_management')) then
    raise exception 'Membership management denied' using errcode = '42501';
  end if;
  update public.membership set membership_role = target_role, membership_status = target_status,
    membership_valid_from = valid_from, membership_valid_to = valid_to where membership_id = target_membership_id;
end;
$$;
create function public.revoke_membership(target_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, false);
  update public.membership set membership_status = 'revoked' where membership_id = target.membership_id;
end;
$$;
create function public.delete_membership(target_membership_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, false);
  delete from public.membership where membership_id = target.membership_id;
end;
$$;

create function public.grant_admin_permission(target_membership_id uuid, target_permission public.admin_permission) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, true);
  if not (select app_private.is_platform_admin()) then
    -- Lock grantor authority against concurrent revocation/suspension.
    perform 1 from public.membership m join public.person p on (p.tenant_id,p.person_id)=(m.tenant_id,m.person_id)
      join public.membership_permission mp on (mp.tenant_id,mp.membership_id)=(m.tenant_id,m.membership_id)
    where m.tenant_id = target.tenant_id and p.user_id = (select auth.uid())
      and m.membership_role = 'tenant_admin' and m.membership_status = 'active'
      and m.membership_valid_from <= now() and (m.membership_valid_to is null or now() < m.membership_valid_to)
      and mp.membership_permission_admin_permission = target_permission for share of m, mp;
    if not found then raise exception 'Permission grant denied' using errcode = '42501'; end if;
  end if;
  insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
    values (target.tenant_id, target.membership_id, target_permission)
    on conflict (tenant_id, membership_id, membership_permission_admin_permission) do nothing;
end;
$$;
create function public.revoke_admin_permission(target_membership_id uuid, target_permission public.admin_permission) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.membership;
begin
  target := app_private.lock_managed_membership(target_membership_id, true);
  delete from public.membership_permission where membership_id = target.membership_id
    and membership_permission_admin_permission = target_permission;
end;
$$;
create function public.update_tenant_platform_settings(target_tenant_id uuid, new_slug text,
  new_subscription_status public.tenant_subscription_status) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select app_private.is_platform_admin()) then
    raise exception 'MFA platform administrator required' using errcode = '42501';
  end if;
  update public.tenant set tenant_slug = new_slug, tenant_subscription_status = new_subscription_status
    where tenant_id = target_tenant_id;
  if not found then raise exception 'Tenant not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on all functions in schema app_private from public, anon, authenticated;
grant execute on function app_private.member_tenant_ids(), app_private.role_tenant_ids(public.membership_role[]),
  app_private.permission_tenant_ids(public.admin_permission), app_private.current_person_ids(), app_private.own_membership_ids(),
  app_private.is_tenant_member(uuid), app_private.has_tenant_role(uuid, public.membership_role[]),
  app_private.has_admin_permission(uuid, public.admin_permission), app_private.is_platform_admin() to authenticated;
revoke all on all functions in schema public from public, anon;
grant execute on function public.create_membership(uuid, public.membership_role, timestamptz, timestamptz),
  public.update_membership(uuid, public.membership_role, public.membership_status, timestamptz, timestamptz),
  public.revoke_membership(uuid), public.delete_membership(uuid),
  public.grant_admin_permission(uuid, public.admin_permission), public.revoke_admin_permission(uuid, public.admin_permission),
  public.update_tenant_platform_settings(uuid, text, public.tenant_subscription_status) to authenticated;
