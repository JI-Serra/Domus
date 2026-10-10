-- M02-F04: complete invitation and join decision definitions.
grant create on schema public to registry_writer;
set role registry_writer;
create or replace function public.create_resident_invitation(target_tenant_id uuid,target_unit_id uuid,invited_email text,
  target_role public.membership_role,client_event_id uuid,target_person_id uuid) returns table(invitation_id uuid,invitation_token text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=app_private.current_user_id(); recipient text:=lower(btrim(invited_email)); target_person public.person;
  resident public.unit_resident; existing public.invitation; secret text:=encode(extensions.gen_random_bytes(32),'hex'); created_id uuid; registry_admin boolean;
begin
  if actor is null or app_private.is_impersonating() or target_role is null or target_role not in('unit_holder','household_member') then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
  perform app_private.require_unit_manager(target_tenant_id,target_unit_id);
  registry_admin:=target_tenant_id in(select app_private.writable_permission_tenant_ids('registry'));
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
  if not registry_admin and (target_person.user_id is not null
    or coalesce(target_person.person_claimed_email,target_person.person_email,recipient)<>recipient
    or exists(select 1 from public.unit_resident r where r.tenant_id=target_tenant_id and r.person_id=target_person_id
      and (r.unit_resident_is_holder or r.unit_id<>target_unit_id))
    or exists(select 1 from public.invitation i where i.tenant_id=target_tenant_id and i.person_id=target_person_id
      and i.invitation_status in('pending','accepted') and i.invitation_id is distinct from existing.invitation_id)) then
    raise exception 'Invitation management denied' using errcode='42501'; end if;
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
create or replace function public.decide_unit_join_request(target_tenant_id uuid,target_unit_id uuid,target_request_id uuid,approve boolean,
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
    perform 1 from public.unit where tenant_id=target_tenant_id and unit_id=target_unit_id and unit_archived_at is null for update;
    if not found then raise exception 'Join request management denied' using errcode='42501'; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('identity:'||target_tenant_id::text,0));
    -- Auth binding is proof; typed document and registry email are claims only, never identity resolution.
    select p.person_id into target_person_id from public.person p where p.tenant_id=target_tenant_id
      and p.user_id=request.unit_join_request_user_id for update;
    if exists(select 1 from public.person p where p.tenant_id=target_tenant_id and p.person_id is distinct from target_person_id
      and ((p.person_document_type=request.unit_join_request_document_type and p.person_document_number=request.unit_join_request_document_number)
        or p.person_email=request.unit_join_request_email
        or (p.person_claimed_document_type=request.unit_join_request_document_type and p.person_claimed_document_number=request.unit_join_request_document_number)
        or p.person_claimed_email=request.unit_join_request_email)) then
      -- No receipt is written: registry resolves the collision explicitly, then retries with the same decision event.
      return jsonb_build_object('status','identity_conflict');
    end if;
    if target_person_id is null then
      insert into public.person(tenant_id,person_first_name,person_last_name,person_email,person_document_type,person_document_number,person_birth_date,person_created_by_user_id)
        values(target_tenant_id,request.unit_join_request_first_name,request.unit_join_request_last_name,request.unit_join_request_email,
          request.unit_join_request_document_type,request.unit_join_request_document_number,request.unit_join_request_birth_date,app_private.current_user_id())
        returning person_id into target_person_id;
    elsif target_tenant_id not in(select app_private.writable_permission_tenant_ids('registry')) then
      return jsonb_build_object('status','identity_conflict');
    end if;
    insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_is_minor)
      select target_tenant_id,target_unit_id,p.person_id,'other',target_role='unit_holder',app_private.resident_is_minor(p,false)
        from public.person p where p.person_id=target_person_id
      on conflict(tenant_id,unit_id,person_id) do nothing;
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

reset role;
revoke create on schema public from registry_writer;
