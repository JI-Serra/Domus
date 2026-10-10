-- Local-only fictional fixtures. Never run this seed against staging/production.
insert into public.tenant (tenant_id, tenant_name, tenant_slug, tenant_address) values
  ('10000000-0000-0000-0000-000000000001', 'Barrio Los Ceibos', 'los-ceibos', 'Avenida Ficticia 101, Yerba Buena'),
  ('10000000-0000-0000-0000-000000000002', 'Barrio Las Tipas', 'las-tipas', 'Avenida Ficticia 202, Yerba Buena');

do $$
declare
  account record;
  account_id uuid;
begin
  for account in select * from (values
    (1, 'platform@domus.local'), (2, 'admin.ceibos@domus.local'),
    (3, 'guard.ceibos@domus.local'), (4, 'holder.ceibos@domus.local'),
    (5, 'member.ceibos@domus.local'), (6, 'admin.tipas@domus.local'),
    (7, 'guard.tipas@domus.local'), (8, 'holder.tipas@domus.local'),
    (9, 'member.tipas@domus.local'), (10, 'shared@domus.local'),
    (12, 'registry.ceibos@domus.local')
  ) as accounts(account_number, email) loop
    account_id := ('20000000-0000-0000-0000-' || lpad(account.account_number::text, 12, '0'))::uuid;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', account_id, 'authenticated', 'authenticated', account.email,
      extensions.crypt('DomusLocal123!', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
      values (account_id, account_id, account_id::text,
        jsonb_build_object('sub', account_id::text, 'email', account.email, 'email_verified', true),
        'email', now(), now());
  end loop;
end;
$$;

insert into public.platform_admin (platform_admin_id, user_id)
  values ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

with fixtures(person_number, account_number, tenant_number, first_name, last_name) as (values
  (2, 2, 1, 'Ana', 'Ceibos'), (3, 3, 1, 'Bruno', 'Ceibos'),
  (4, 4, 1, 'Carla', 'Ceibos'), (5, 5, 1, 'Diego', 'Ceibos'),
  (6, 6, 2, 'Elena', 'Tipas'), (7, 7, 2, 'Fabian', 'Tipas'),
  (8, 8, 2, 'Gabriela', 'Tipas'), (9, 9, 2, 'Hector', 'Tipas'),
  (10, 10, 1, 'Ines', 'Compartida'), (11, 10, 2, 'Ines', 'Compartida'),
  (12, 12, 1, 'Julian', 'Registro')
)
insert into public.person (person_id, tenant_id, user_id, person_first_name, person_last_name,
  person_document_type, person_document_number)
select ('30000000-0000-0000-0000-' || lpad(person_number::text, 12, '0'))::uuid,
  ('10000000-0000-0000-0000-' || lpad(tenant_number::text, 12, '0'))::uuid,
  ('20000000-0000-0000-0000-' || lpad(account_number::text, 12, '0'))::uuid,
  first_name, last_name, 'dni'::public.person_document_type, (90000000 + account_number)::text from fixtures;

with fixtures(person_number, tenant_number, role_name) as (values
  (2, 1, 'tenant_admin'), (3, 1, 'guard'), (4, 1, 'unit_holder'), (5, 1, 'household_member'),
  (6, 2, 'tenant_admin'), (7, 2, 'guard'), (8, 2, 'unit_holder'), (9, 2, 'household_member'),
  (10, 1, 'unit_holder'), (11, 2, 'unit_holder'), (12, 1, 'tenant_admin')
)
insert into public.membership (membership_id, tenant_id, person_id, membership_role, membership_valid_from)
select ('40000000-0000-0000-0000-' || lpad(person_number::text, 12, '0'))::uuid,
  ('10000000-0000-0000-0000-' || lpad(tenant_number::text, 12, '0'))::uuid,
  ('30000000-0000-0000-0000-' || lpad(person_number::text, 12, '0'))::uuid,
  role_name::public.membership_role, '2020-01-01T00:00:00Z' from fixtures;

insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
select m.tenant_id, m.membership_id, permission
from public.membership m cross join unnest(enum_range(null::public.admin_permission)) permission
where m.membership_id in ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006');

insert into public.membership_permission (tenant_id, membership_id, membership_permission_admin_permission)
values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000012', 'registry');

-- M01: fictional invitation and completed support examples.
insert into public.invitation(tenant_id,invitation_email,invitation_first_name,invitation_last_name,
  invitation_membership_role,invitation_token_hash,invitation_expires_at,invitation_created_by_user_id,client_event_id)
values('10000000-0000-0000-0000-000000000001','invite.ceibos@domus.local','Lucia','Invitada',
  'guard',encode(extensions.digest(repeat('a',64),'sha256'),'hex'),now()+interval '7 days',
  '20000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001');
insert into public.invitation(tenant_id,invitation_email,person_id,invitation_membership_role,
  invitation_token_hash,invitation_expires_at,invitation_status,invitation_created_by_user_id,
  invitation_accepted_by_user_id,invitation_accepted_at,client_event_id)
values('10000000-0000-0000-0000-000000000002','member.tipas@domus.local',
  '30000000-0000-0000-0000-000000000009','household_member',
  encode(extensions.digest(repeat('b',64),'sha256'),'hex'),now()+interval '7 days','accepted',
  '20000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000009',now(),
  '60000000-0000-0000-0000-000000000002');
-- M02: 40 fictional units per tenant; historical H0 identities remain stable for existing integration fixtures.
insert into public.unit(unit_id,tenant_id,unit_code,unit_block_code,unit_lot_number,unit_contact_phone,unit_backup_phone)
select (case when t=1 then 'a1000000' else 'a2000000' end||'-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('10000000-0000-0000-0000-'||lpad(t::text,12,'0'))::uuid,
  'Mz '||((n-1)/10+1)::text||' Lote '||((n-1)%10+1)::text,((n-1)/10+1)::text,((n-1)%10+1)::text,
  '+54 381 555 '||lpad((t*100+n)::text,4,'0'),'+54 381 555 '||lpad((t*200+n)::text,4,'0')
from generate_series(1,2) t cross join generate_series(1,40) n;

insert into public.person(person_id,tenant_id,person_first_name,person_last_name,person_document_type,person_document_number,person_email)
select (case when t=1 then 'b1000000' else 'b2000000' end||'-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  ('10000000-0000-0000-0000-'||lpad(t::text,12,'0'))::uuid,
  (array['Mariana','Pablo','Lucia','Martin','Sofia','Nicolas'])[1+(n%6)],
  (array['Lopez','Garcia','Perez','Ruiz','Diaz','Gomez'])[1+(n%6)],'dni',(70000000+t*1000+n)::text,
  'resident.'||t::text||'.'||n::text||'@domus.local'
from generate_series(1,2) t cross join generate_series(3,28) n;

insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_valid_from_at)
select p.tenant_id,('a'||case when right(p.tenant_id::text,1)='1' then '1' else '2' end||'000000-0000-0000-0000-'||right(p.person_id::text,12))::uuid,
  p.person_id,'owner',true,'2020-01-01' from public.person p where p.person_id::text like 'b%';

with links(person_number,tenant_number,unit_number,is_holder) as(values
  (4,1,1,true),(5,1,1,false),(8,2,1,true),(9,2,1,false),(10,1,2,true),(11,2,2,true))
insert into public.unit_resident(tenant_id,unit_id,person_id,unit_resident_relationship,unit_resident_is_holder,unit_resident_valid_from_at)
select ('10000000-0000-0000-0000-'||lpad(tenant_number::text,12,'0'))::uuid,
  (case when tenant_number=1 then 'a1000000' else 'a2000000' end||'-0000-0000-0000-'||lpad(unit_number::text,12,'0'))::uuid,
  ('30000000-0000-0000-0000-'||lpad(person_number::text,12,'0'))::uuid,
  case when is_holder then 'owner'::public.unit_resident_relationship else 'family' end,is_holder,'2020-01-01' from links;
update public.membership m set unit_id=r.unit_id from public.unit_resident r
  where (r.tenant_id,r.person_id)=(m.tenant_id,m.person_id) and m.membership_role in('unit_holder','household_member');
insert into public.membership_household_permission(tenant_id,membership_id,membership_household_permission_permission)
  select tenant_id,membership_id,'manage_access_authorizations' from public.membership where membership_role='household_member';
update public.unit set unit_status=case when right(unit_id::text,12)::integer<=28 then 'occupied'::public.unit_status
  when right(unit_id::text,12)::integer<=35 then 'under_construction'::public.unit_status else 'vacant'::public.unit_status end;
update public.invitation set unit_id='a2000000-0000-0000-0000-000000000001' where client_event_id='60000000-0000-0000-0000-000000000002';

insert into public.vehicle(tenant_id,unit_id,vehicle_plate_code,vehicle_make_name,vehicle_model_name,vehicle_color_name)
select tenant_id,unit_id,'AA'||lpad((right(unit_id::text,12)::integer+case when right(tenant_id::text,1)='1' then 100 else 200 end)::text,3,'0')||'BB',
  (array['Toyota','Renault','Volkswagen'])[1+(right(unit_id::text,12)::integer%3)],'Fictional model',
  (array['Blanco','Gris','Azul'])[1+(right(unit_id::text,12)::integer%3)] from public.unit where unit_status='occupied';
insert into public.pet(tenant_id,unit_id,pet_name,pet_species_name,pet_breed_name)
  select tenant_id,unit_id,(array['Luna','Mora','Toby','Coco'])[1+(right(unit_id::text,12)::integer%4)],
    case when right(unit_id::text,12)::integer%3=0 then 'cat' else 'dog' end,'Mixed breed'
  from public.unit where unit_status='occupied' and right(unit_id::text,12)::integer%2=0;
insert into public.gate(gate_id,tenant_id,gate_name,gate_kind)
  select (case when right(tenant_id::text,1)='1' then 'd1000000' else 'd2000000' end||'-0000-0000-0000-000000000001')::uuid,
    tenant_id,'Acceso principal','vehicular' from public.tenant;
insert into public.gate_guard(tenant_id,gate_id,membership_id)
  select m.tenant_id,g.gate_id,m.membership_id from public.membership m join public.gate g using(tenant_id) where m.membership_role='guard';
insert into public.device(device_id,tenant_id,gate_id,device_name,device_credential_hash,device_paired_by_user_id)
  select (case when right(g.tenant_id::text,1)='1' then 'e1000000' else 'e2000000' end||'-0000-0000-0000-000000000001')::uuid,
    g.tenant_id,g.gate_id,'Tablet principal',encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex'),p.user_id
  from public.gate g join public.person p using(tenant_id) join public.membership m using(tenant_id,person_id) where m.membership_role='guard';
insert into public.support_session(tenant_id,support_session_actor_user_id,support_session_target_user_id,
  support_session_reason,support_session_started_at,support_session_expires_at,support_session_ended_at,
  support_session_status,support_session_ended_by_user_id,client_event_id)
values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002','Fictional support example',now()-interval '1 hour',
  now()-interval '30 minutes',now()-interval '45 minutes','ended','20000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001');
