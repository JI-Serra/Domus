-- M02-F04: reuse H1 consent, including its mailbox proof and isolated identity-binding capability.
alter table public.unit_join_request add column unit_join_request_birth_date date;
create function app_private.person_email_matches_user(target_person public.person,recipient text) returns boolean
language sql stable security definer set search_path='' as $$
  select app_private.current_identity_is_valid() and exists(select 1 from auth.users u
    where u.id=target_person.user_id and lower(u.email)=recipient and u.email_confirmed_at is not null);
$$;
revoke all on function app_private.person_email_matches_user(public.person,text) from public,anon,authenticated,service_role;
grant execute on function app_private.person_email_matches_user(public.person,text) to registry_writer;

create function public.create_resident_invitation(target_tenant_id uuid,target_unit_id uuid,invited_email text,
  target_role public.membership_role,client_event_id uuid,target_person_id uuid) returns table(invitation_id uuid,invitation_token text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=app_private.current_user_id(); recipient text:=lower(btrim(invited_email)); target_person public.person;
  resident public.unit_resident; existing public.invitation; secret text:=encode(extensions.gen_random_bytes(32),'hex'); created_id uuid;
begin
  if actor is null or app_private.is_impersonating() or target_role is null or target_role not in('unit_holder','household_member') then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  if target_role='unit_holder' and target_tenant_id not in(select app_private.writable_permission_tenant_ids('registry')) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  if recipient=app_private.verified_email() then raise exception 'Invitation management denied' using errcode='42501'; end if;
  if create_resident_invitation.client_event_id is null then raise exception 'Invalid invitation input' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(create_resident_invitation.client_event_id::text,0));
  select i.* into existing from public.invitation i where i.client_event_id=create_resident_invitation.client_event_id for update;
  if found then
    if existing.tenant_id is distinct from target_tenant_id or existing.unit_id is distinct from target_unit_id
      or existing.person_id is distinct from target_person_id or existing.invitation_email is distinct from recipient
      or existing.invitation_membership_role is distinct from target_role or existing.invitation_created_by_user_id is distinct from actor
      or existing.invitation_status<>'pending' or existing.invitation_expires_at<=statement_timestamp() then
      raise exception 'Invitation management denied' using errcode='42501'; end if;
  end if;
  -- Revalidate resident eligibility on retries as well as on initial issuance.
  select p.* into target_person from public.person p join public.unit_resident r using(tenant_id,person_id)
    join public.unit u using(tenant_id,unit_id)
    where p.tenant_id=target_tenant_id and p.person_id=target_person_id
      and (p.user_id is null or app_private.person_email_matches_user(p,recipient))
      and p.user_id is distinct from actor and r.unit_id=target_unit_id
      and not app_private.resident_is_minor(p,r.unit_resident_is_minor) and u.unit_archived_at is null
      and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
      and (target_role<>'unit_holder' or r.unit_resident_is_holder) for update of p;
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
  if existing.invitation_id is not null then
    if existing.invitation_delivered_at is not null then return query select existing.invitation_id,null::text; return; end if;
    update public.invitation set invitation_token_hash=encode(extensions.digest(secret,'sha256'),'hex') where invitation_id=existing.invitation_id;
    return query select existing.invitation_id,secret; return;
  end if;
  if exists(select 1 from public.invitation i where i.tenant_id=target_tenant_id and i.person_id=target_person_id
    and i.invitation_status='pending' and i.invitation_expires_at>statement_timestamp()) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  insert into public.invitation(tenant_id,unit_id,person_id,invitation_email,invitation_membership_role,invitation_token_hash,
    invitation_expires_at,invitation_created_by_user_id,client_event_id)
    values(target_tenant_id,target_unit_id,target_person_id,recipient,target_role,encode(extensions.digest(secret,'sha256'),'hex'),
      statement_timestamp()+interval '7 days',actor,create_resident_invitation.client_event_id) returning invitation_id into created_id;
  return query select created_id,secret;
end;
$$;
create function public.mark_resident_invitation_delivered(target_tenant_id uuid,target_unit_id uuid,target_invitation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if app_private.is_impersonating() then raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  update public.invitation set invitation_delivered_at=coalesce(invitation_delivered_at,statement_timestamp())
    where tenant_id=target_tenant_id and unit_id=target_unit_id and invitation_id=target_invitation_id
      and invitation_created_by_user_id=app_private.current_user_id() and invitation_status='pending';
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
end;
$$;
create function public.revoke_resident_invitation(target_tenant_id uuid,target_unit_id uuid,target_invitation_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if app_private.is_impersonating() then raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  update public.invitation set invitation_status='revoked' where tenant_id=target_tenant_id and unit_id=target_unit_id
    and invitation_id=target_invitation_id and invitation_status='pending'
    and (invitation_membership_role='household_member' or target_tenant_id in(select app_private.writable_permission_tenant_ids('registry')));
  if not found then raise exception 'Invitation management denied' using errcode='42501'; end if;
end;
$$;

-- Complete H1 grant-validator definition, extended by the holder's CURRENT unit authority (not their tenant-wide role).
create or replace function app_private.invitation_grant_is_valid(target_invitation_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare target public.invitation; required_permission public.admin_permission;
begin
  if app_private.verified_email() is null or app_private.is_impersonating() then return false; end if;
  select i.* into target from public.invitation i where i.invitation_id=target_invitation_id
    and i.invitation_email=app_private.verified_email() and i.invitation_status='pending';
  if not found then return false; end if;
  if target.unit_id is not null then
    if not exists(select 1 from public.unit u join public.unit_resident r using(tenant_id,unit_id)
      join public.person p using(tenant_id,person_id)
      where u.tenant_id=target.tenant_id and u.unit_id=target.unit_id and u.unit_archived_at is null
        and r.person_id=target.person_id and (p.user_id is null or p.user_id=app_private.current_user_id())
        and not app_private.resident_is_minor(p,r.unit_resident_is_minor)
        and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
        and (target.invitation_membership_role<>'unit_holder' or r.unit_resident_is_holder)) then return false; end if;
    if target.invitation_membership_role='household_member' then
      perform 1 from public.membership m join public.person p using(tenant_id,person_id)
        join public.unit_resident r using(tenant_id,unit_id,person_id)
      where m.tenant_id=target.tenant_id and m.unit_id=target.unit_id and p.user_id=target.invitation_created_by_user_id
        and m.membership_role='unit_holder' and m.membership_status='active' and m.membership_valid_from<=now()
        and (m.membership_valid_to is null or now()<m.membership_valid_to) and r.unit_resident_is_holder
        and not app_private.resident_is_minor(p,r.unit_resident_is_minor) and r.unit_resident_valid_from_at<=now()
        and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at) for share of m,r;
      if found then return true; end if;
    end if;
  end if;
  perform 1 from public.platform_admin a where a.user_id=target.invitation_created_by_user_id and a.platform_admin_is_active for share;
  if found and target.unit_id is null then return true; end if;
  required_permission:=case when target.invitation_membership_role='tenant_admin' then 'admin_management'::public.admin_permission else 'registry'::public.admin_permission end;
  perform 1 from public.membership m join public.person p using(tenant_id,person_id)
    join public.membership_permission mp using(tenant_id,membership_id)
  where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id
    and m.membership_role='tenant_admin' and m.membership_status='active' and m.membership_valid_from<=now()
    and (m.membership_valid_to is null or now()<m.membership_valid_to) and mp.membership_permission_admin_permission=required_permission for share of m,mp;
  if not found then return false; end if;
  return not exists(select 1 from unnest(target.invitation_admin_permissions) requested where not exists(
    select 1 from public.membership m join public.person p using(tenant_id,person_id) join public.membership_permission mp using(tenant_id,membership_id)
    where m.tenant_id=target.tenant_id and p.user_id=target.invitation_created_by_user_id and m.membership_role='tenant_admin'
      and m.membership_status='active' and m.membership_valid_from<=now() and (m.membership_valid_to is null or now()<m.membership_valid_to)
      and mp.membership_permission_admin_permission=requested));
end;
$$;
-- Complete H1 acceptance definition; identity binding remains exclusively invitation_acceptor-owned.
grant create on schema public to invitation_acceptor;
set role invitation_acceptor;
create or replace function public.accept_invitation(token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.invitation; actor uuid; target_person public.person; created_membership uuid; resident public.unit_resident;
begin
  target:=app_private.pending_invitation_for_token(token,true); actor:=app_private.current_user_id();
  if actor is null then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.tenant_id::text||actor::text,0));
  if target.person_id is null then
    select p.* into target_person from public.person p where p.tenant_id=target.tenant_id and p.user_id=actor for update;
    if not found then
      insert into public.person(tenant_id,user_id,person_first_name,person_last_name)
        values(target.tenant_id,actor,target.invitation_first_name,target.invitation_last_name) returning * into target_person;
    end if;
  else
    select p.* into target_person from public.person p where p.tenant_id=target.tenant_id and p.person_id=target.person_id for update;
    if not found or (target_person.user_id is not null and (target.unit_id is null or target_person.user_id is distinct from actor)) then
      raise exception 'Invitation unavailable' using errcode='42501'; end if;
    if target_person.user_id is null then
      update public.person p set user_id=actor where p.tenant_id=target.tenant_id and p.person_id=target_person.person_id and p.user_id is null returning p.* into target_person;
      if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
    end if;
  end if;
  if target_person.user_id is distinct from actor or target_person.tenant_id is distinct from target.tenant_id then
    raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if target.unit_id is not null then
    select r.* into resident from public.unit_resident r join public.unit u using(tenant_id,unit_id)
      where r.tenant_id=target.tenant_id and r.unit_id=target.unit_id and r.person_id=target_person.person_id
        and u.unit_archived_at is null and not app_private.resident_is_minor(target_person,r.unit_resident_is_minor)
        and r.unit_resident_valid_from_at<=now() and (r.unit_resident_valid_to_at is null or now()<r.unit_resident_valid_to_at)
        and (target.invitation_membership_role<>'unit_holder' or r.unit_resident_is_holder) for update of r;
    if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
  end if;
  if exists(select 1 from public.membership m where m.tenant_id=target.tenant_id and m.person_id=target_person.person_id
    and m.membership_role=target.invitation_membership_role and (target.unit_id is null or m.unit_id=target.unit_id)
    and m.membership_status='active' and (m.membership_valid_to is null or now()<m.membership_valid_to)) then
    raise exception 'Invitation unavailable' using errcode='42501'; end if;
  if target.unit_id is not null then
    update public.membership set membership_status='revoked' where tenant_id=target.tenant_id and person_id=target_person.person_id
      and unit_id=target.unit_id and membership_role=target.invitation_membership_role and membership_status='active' and membership_valid_to<=now();
  end if;
  insert into public.membership(tenant_id,person_id,unit_id,membership_role,membership_valid_from,membership_valid_to)
    values(target.tenant_id,target_person.person_id,target.unit_id,target.invitation_membership_role,
      coalesce(resident.unit_resident_valid_from_at,now()),resident.unit_resident_valid_to_at) returning membership_id into created_membership;
  insert into public.membership_permission(tenant_id,membership_id,membership_permission_admin_permission)
    select target.tenant_id,created_membership,p from(select distinct unnest(target.invitation_admin_permissions) p) granted;
  if target.unit_id is not null and target.invitation_membership_role='household_member' then
    insert into public.membership_household_permission(tenant_id,membership_id,membership_household_permission_permission)
      values(target.tenant_id,created_membership,'manage_access_authorizations');
  end if;
  update public.invitation set person_id=target_person.person_id,invitation_status='accepted',invitation_accepted_at=statement_timestamp(),
    invitation_accepted_by_user_id=actor where invitation_id=target.invitation_id;
  update public.invitation set invitation_status='revoked' where tenant_id=target.tenant_id and person_id=target_person.person_id
    and invitation_status='pending' and invitation_id<>target.invitation_id;
  return created_membership;
exception when unique_violation or check_violation then raise exception 'Invitation unavailable' using errcode='42501';
end;
$$;
reset role;
revoke create on schema public from invitation_acceptor;
grant execute on function app_private.resident_is_minor(public.person,boolean) to invitation_acceptor;
grant update(membership_status) on public.membership to invitation_acceptor;

create function public.rotate_unit_join_code(target_tenant_id uuid,target_unit_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare alphabet text:='23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; random_data bytea:=extensions.gen_random_bytes(12); secret text:=''; position integer;
begin
  if app_private.is_impersonating() then raise exception 'Join code management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null for update;
  if not found then raise exception 'Join code management denied' using errcode='42501'; end if;
  for position in 0..11 loop secret:=secret||substr(alphabet,(get_byte(random_data,position)%32)+1,1); end loop;
  insert into public.unit_join_code(tenant_id,unit_id,unit_join_code_hash,unit_join_code_rotated_by_user_id)
    values(target_tenant_id,target_unit_id,encode(extensions.digest(secret,'sha256'),'hex'),app_private.current_user_id())
  on conflict(tenant_id,unit_id) do update set unit_join_code_hash=excluded.unit_join_code_hash,unit_join_code_rotated_by_user_id=excluded.unit_join_code_rotated_by_user_id;
  return substr(secret,1,4)||'-'||substr(secret,5,4)||'-'||substr(secret,9,4);
end;
$$;
create function public.submit_unit_join_request(target_tenant_id uuid,join_code text,person_data jsonb,client_event_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=app_private.current_user_id(); normalized text:=upper(regexp_replace(coalesce(join_code,''),'[-[:space:]]','','g'));
  code public.unit_join_code; created_id uuid; existing public.unit_join_request; payload jsonb:=jsonb_build_array(normalized,person_data);
  unavailable jsonb:='{"status":"unavailable"}'; allowed boolean;
begin
  if actor is null or app_private.is_impersonating() or app_private.verified_email() is null then return unavailable; end if;
  allowed:=app_private.consume_registry_attempt('join:user:'||actor::text,5);
  if not allowed then return unavailable; end if;
  -- No unit lookup or lock until the caller has proved a live authenticated identity.
  if normalized ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$' then
    select c.* into code from public.unit_join_code c join public.unit u using(tenant_id,unit_id) join public.tenant t using(tenant_id)
      where c.tenant_id=target_tenant_id and c.unit_join_code_hash=encode(extensions.digest(normalized,'sha256'),'hex')
        and u.unit_archived_at is null and t.tenant_subscription_status in('pilot','active') for share of c,u;
  end if;
  if code.unit_id is null or not app_private.constant_time_hash_equal(coalesce(code.unit_join_code_hash,repeat('0',64)),encode(extensions.digest(normalized,'sha256'),'hex')) then
    -- Tenant failed counters never reject a valid secret, so an attacker cannot exhaust legitimate onboarding.
    if not app_private.consume_registry_attempt('join:tenant:'||coalesce(target_tenant_id::text,'none'),100) then return unavailable; end if;
    return unavailable;
  end if;
  begin
  if client_event_id is null or jsonb_typeof(person_data) is distinct from 'object'
    or length(btrim(coalesce(person_data->>'person_first_name',''))) not between 1 and 100
    or length(btrim(coalesce(person_data->>'person_last_name',''))) not between 1 and 100
    or coalesce((person_data->>'unit_resident_is_minor')::boolean,false)
    or (person_data->>'person_birth_date')::date>(current_date-interval '18 years')::date then return unavailable; end if;
  exception when invalid_text_representation or datetime_field_overflow then return unavailable;
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(client_event_id::text,0));
  select r.* into existing from public.unit_join_request r where r.client_event_id=submit_unit_join_request.client_event_id;
  if found then
    if existing.unit_join_request_user_id is distinct from actor or existing.tenant_id is distinct from target_tenant_id
      or existing.unit_id is distinct from code.unit_id then return unavailable; end if;
    return jsonb_build_object('status',existing.unit_join_request_status,'unit_join_request_id',existing.unit_join_request_id);
  end if;
  select unit_join_request_id into created_id from public.unit_join_request where tenant_id=target_tenant_id and unit_id=code.unit_id
    and unit_join_request_user_id=actor and unit_join_request_status='pending';
  if created_id is null then
    begin
    insert into public.unit_join_request(tenant_id,unit_id,unit_join_request_user_id,unit_join_request_email,unit_join_request_first_name,
      unit_join_request_last_name,unit_join_request_document_type,unit_join_request_document_number,unit_join_request_birth_date,client_event_id)
    values(target_tenant_id,code.unit_id,actor,app_private.verified_email(),btrim(person_data->>'person_first_name'),btrim(person_data->>'person_last_name'),
      nullif(person_data->>'person_document_type','')::public.person_document_type,nullif(person_data->>'person_document_number',''),
      nullif(person_data->>'person_birth_date','')::date,submit_unit_join_request.client_event_id) returning unit_join_request_id into created_id;
    exception when check_violation or invalid_text_representation or datetime_field_overflow then return unavailable;
    end;
  end if;
  return jsonb_build_object('status','pending','unit_join_request_id',created_id);
end;
$$;
create function public.decide_unit_join_request(target_tenant_id uuid,target_unit_id uuid,target_request_id uuid,approve boolean,
  client_event_id uuid,target_role public.membership_role default 'household_member') returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.unit_join_request; resident_id uuid; target_person_id uuid; invitation_result record; receipt jsonb;
  payload jsonb:=jsonb_build_array(target_unit_id,target_request_id,approve,target_role);
begin
  if app_private.is_impersonating() then raise exception 'Join request management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  if target_role not in('household_member','unit_holder') or (target_role='unit_holder'
    and target_tenant_id not in(select app_private.writable_permission_tenant_ids('registry'))) then
    raise exception 'Join request management denied' using errcode='42501'; end if;
  receipt:=app_private.registry_retry(client_event_id,target_tenant_id,'decide_unit_join_request',payload);
  if receipt is not null then return receipt; end if;
  select * into request from public.unit_join_request where tenant_id=target_tenant_id and unit_id=target_unit_id
    and unit_join_request_id=target_request_id and unit_join_request_status='pending'
    and unit_join_request_user_id<>app_private.current_user_id() for update;
  if not found then raise exception 'Join request management denied' using errcode='42501'; end if;
  if approve is null then raise exception 'Invalid decision' using errcode='22023'; end if;
  if approve then
    resident_id:=public.save_resident(target_tenant_id,target_unit_id,jsonb_build_object(
      'person_first_name',request.unit_join_request_first_name,'person_last_name',request.unit_join_request_last_name,
      'person_email',request.unit_join_request_email,'person_document_type',request.unit_join_request_document_type,
      'person_document_number',request.unit_join_request_document_number,'person_birth_date',request.unit_join_request_birth_date),
      jsonb_build_object('unit_resident_relationship','other','unit_resident_is_holder',target_role='unit_holder'),extensions.uuid_generate_v5(client_event_id,'resident'));
    select person_id into target_person_id from public.unit_resident where unit_resident_id=resident_id;
    select * into invitation_result from public.create_resident_invitation(target_tenant_id,target_unit_id,request.unit_join_request_email,
      target_role,extensions.uuid_generate_v5(client_event_id,'invitation'),target_person_id);
    -- Do not return/store the secret; send-invitation retries the same event to deliver a fresh one by email.
    receipt:=jsonb_build_object('status','approved','invitation_id',invitation_result.invitation_id,
      'invitation_client_event_id',extensions.uuid_generate_v5(client_event_id,'invitation'),'person_id',target_person_id);
  else receipt:='{"status":"rejected"}'; end if;
  update public.unit_join_request set unit_join_request_status=case when approve then 'approved'::public.unit_join_request_status else 'rejected' end,
    unit_join_request_decided_at=statement_timestamp(),unit_join_request_decided_by_user_id=app_private.current_user_id(),
    invitation_id=(receipt->>'invitation_id')::uuid where unit_join_request_id=target_request_id;
  perform app_private.registry_finish(client_event_id,target_tenant_id,'decide_unit_join_request',payload,receipt); return receipt;
end;
$$;
