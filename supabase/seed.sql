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
