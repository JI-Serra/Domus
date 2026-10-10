-- M02-F04/F05: owner reads and proven mailbox settlement preserve application membership context.
drop policy "registry admins and owners can read people" on public.person;
create policy "registry admins and owners can read people" on public.person for select to authenticated using
  (tenant_id in(select app_private.permission_tenant_ids('registry')) or person_id in(select app_private.current_person_ids()));
grant update(person_email,person_claimed_email) on public.person to invitation_acceptor;
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
  -- Email-link consent proves this mailbox only. Document claims are never settled by mailbox proof.
  if target_person.person_claimed_email=app_private.verified_email() then
    begin
      update public.person p set person_email=target_person.person_claimed_email,person_claimed_email=null
        where p.tenant_id=target.tenant_id and p.person_id=target_person.person_id and p.user_id=actor
          and not exists(select 1 from public.person other where other.tenant_id=target.tenant_id
            and other.person_id<>p.person_id and other.person_email=target_person.person_claimed_email);
    exception when unique_violation then null; -- A concurrent canonical collision stays in registry review.
    end;
  end if;
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
grant create on schema public to registry_writer;
set role registry_writer;
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
    else
      -- The existing binding plus the live verified account mailbox, rather than applicant text, is proof.
      update public.person p set person_email=request.unit_join_request_email,person_claimed_email=null
        where p.tenant_id=target_tenant_id and p.person_id=target_person_id
          and p.person_claimed_email=request.unit_join_request_email
          and app_private.person_email_matches_user(p,request.unit_join_request_email);
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
