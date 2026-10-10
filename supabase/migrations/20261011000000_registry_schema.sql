-- M02: registry entities and an isolated RPC writer. H0/H1 migrations remain frozen.
create extension if not exists pg_trgm with schema extensions;
create type public.unit_resident_relationship as enum ('owner','tenant','family','other');
create type public.household_permission as enum ('view_unit_finance','book_amenities','manage_access_authorizations');
create type public.unit_join_request_status as enum ('pending','approved','rejected');
create type public.gate_kind as enum ('vehicular','pedestrian');
create type public.device_status as enum ('active','revoked');
create type public.registry_import_status as enum ('preview','confirmed');

do $$ begin
  if not exists(select 1 from pg_roles where rolname='registry_writer') then
    create role registry_writer nologin noinherit;
  end if;
end $$;
grant registry_writer to postgres with inherit false, set true;
grant usage on schema public,app_private,extensions to registry_writer;

alter table public.person add column person_email text;
alter table public.person add constraint person_email_check check
  (person_email is null or (person_email=lower(btrim(person_email)) and person_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
create unique index person_tenant_id_person_email_key on public.person(tenant_id,person_email) where person_email is not null;
create index person_display_name_idx on public.person using gin ((person_first_name||' '||person_last_name) extensions.gin_trgm_ops);
create index person_email_idx on public.person using gin (person_email extensions.gin_trgm_ops);

create table public.unit (
  unit_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  unit_code text not null, unit_block_code text, unit_lot_number text,
  unit_status public.unit_status not null default 'vacant',
  unit_coefficient numeric(14,6) not null default 1,
  unit_is_billable boolean, -- NULL inherits tenant criteria (D20).
  unit_contact_phone public.phone_number, unit_backup_phone public.phone_number,
  unit_archived_at timestamptz,
  unit_created_at timestamptz not null default now(), unit_updated_at timestamptz not null default now(),
  constraint unit_tenant_id_unit_id_key unique(tenant_id,unit_id),
  constraint unit_code_check check(length(btrim(unit_code)) between 1 and 100 and unit_code=btrim(unit_code)),
  constraint unit_coefficient_check check(unit_coefficient>0)
);
create unique index unit_tenant_id_unit_code_key on public.unit(tenant_id,lower(unit_code));
create index unit_code_idx on public.unit using gin (unit_code extensions.gin_trgm_ops);

create table public.unit_resident (
  unit_resident_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  unit_id uuid not null, person_id uuid not null,
  unit_resident_relationship public.unit_resident_relationship not null default 'other',
  unit_resident_is_holder boolean not null default false, unit_resident_is_minor boolean not null default false,
  unit_resident_valid_from_at timestamptz not null default now(), unit_resident_valid_to_at timestamptz,
  unit_resident_created_at timestamptz not null default now(), unit_resident_updated_at timestamptz not null default now(),
  constraint unit_resident_tenant_id_unit_id_person_id_key unique(tenant_id,unit_id,person_id),
  constraint unit_resident_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id),
  constraint unit_resident_tenant_id_person_id_fkey foreign key(tenant_id,person_id) references public.person(tenant_id,person_id),
  constraint unit_resident_validity_check check(unit_resident_valid_to_at is null or unit_resident_valid_to_at>unit_resident_valid_from_at),
  constraint unit_resident_minor_holder_check check(not(unit_resident_is_minor and unit_resident_is_holder))
);
create index unit_resident_tenant_id_person_id_idx on public.unit_resident(tenant_id,person_id);
alter table public.membership add column unit_id uuid;
alter table public.membership add constraint membership_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id);
alter table public.membership add constraint membership_unit_role_check check(unit_id is null or membership_role in ('unit_holder','household_member'));
create index membership_tenant_id_unit_id_idx on public.membership(tenant_id,unit_id);
create unique index membership_active_unit_role_key on public.membership(tenant_id,person_id,unit_id,membership_role)
  where membership_status='active' and unit_id is not null;
alter table public.invitation add column unit_id uuid;
alter table public.invitation add constraint invitation_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id);
alter table public.invitation add constraint invitation_unit_role_check check(unit_id is null or invitation_membership_role in ('unit_holder','household_member'));
create index invitation_tenant_id_unit_id_idx on public.invitation(tenant_id,unit_id);

create table public.membership_household_permission (
  membership_household_permission_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  membership_id uuid not null,
  membership_household_permission_permission public.household_permission not null,
  membership_household_permission_created_at timestamptz not null default now(), membership_household_permission_updated_at timestamptz not null default now(),
  constraint membership_household_permission_tenant_id_membership_id_fkey foreign key(tenant_id,membership_id) references public.membership(tenant_id,membership_id),
  constraint membership_household_permission_tenant_id_membership_id_permission_key unique(tenant_id,membership_id,membership_household_permission_permission)
);

create table public.vehicle (
  vehicle_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, unit_id uuid not null,
  vehicle_plate_code text not null, vehicle_make_name text, vehicle_model_name text, vehicle_color_name text,
  vehicle_archived_at timestamptz,
  vehicle_created_at timestamptz not null default now(), vehicle_updated_at timestamptz not null default now(),
  constraint vehicle_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id),
  constraint vehicle_tenant_id_vehicle_plate_code_key unique(tenant_id,vehicle_plate_code),
  constraint vehicle_plate_check check(vehicle_plate_code ~ '^[A-Z0-9]{3,12}$')
);
create index vehicle_tenant_id_unit_id_idx on public.vehicle(tenant_id,unit_id);
create index vehicle_plate_code_idx on public.vehicle using gin (vehicle_plate_code extensions.gin_trgm_ops);
create table public.pet (
  pet_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, unit_id uuid not null,
  pet_name text not null, pet_species_name text not null, pet_breed_name text, pet_photo_path text, pet_archived_at timestamptz,
  pet_created_at timestamptz not null default now(), pet_updated_at timestamptz not null default now(),
  constraint pet_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id),
  constraint pet_name_check check(length(btrim(pet_name)) between 1 and 100 and length(btrim(pet_species_name)) between 1 and 100),
  constraint pet_photo_path_check check(pet_photo_path is null or pet_photo_path like tenant_id::text||'/'||unit_id::text||'/%')
);
create index pet_tenant_id_unit_id_idx on public.pet(tenant_id,unit_id);

create table public.unit_join_code (
  unit_join_code_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, unit_id uuid not null,
  unit_join_code_hash text not null unique, unit_join_code_rotated_by_user_id uuid not null references auth.users,
  unit_join_code_created_at timestamptz not null default now(), unit_join_code_updated_at timestamptz not null default now(),
  constraint unit_join_code_tenant_id_unit_id_key unique(tenant_id,unit_id),
  constraint unit_join_code_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id),
  constraint unit_join_code_hash_check check(unit_join_code_hash ~ '^[a-f0-9]{64}$')
);
create index unit_join_code_rotated_by_user_id_idx on public.unit_join_code(unit_join_code_rotated_by_user_id);
create table public.unit_join_request (
  unit_join_request_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, unit_id uuid not null,
  unit_join_request_user_id uuid not null references auth.users,
  unit_join_request_email text not null, unit_join_request_first_name text not null, unit_join_request_last_name text not null,
  unit_join_request_document_type public.person_document_type, unit_join_request_document_number public.document_number,
  unit_join_request_status public.unit_join_request_status not null default 'pending',
  unit_join_request_decided_by_user_id uuid references auth.users, unit_join_request_decided_at timestamptz,
  invitation_id uuid references public.invitation,
  client_event_id uuid not null unique,
  unit_join_request_created_at timestamptz not null default now(), unit_join_request_updated_at timestamptz not null default now(),
  constraint unit_join_request_tenant_id_unit_id_fkey foreign key(tenant_id,unit_id) references public.unit(tenant_id,unit_id),
  constraint unit_join_request_document_check check((unit_join_request_document_type is null)=(unit_join_request_document_number is null)),
  constraint unit_join_request_decision_check check((unit_join_request_status='pending')=(unit_join_request_decided_at is null and unit_join_request_decided_by_user_id is null))
);
create index unit_join_request_tenant_id_unit_id_idx on public.unit_join_request(tenant_id,unit_id);
create index unit_join_request_user_id_idx on public.unit_join_request(unit_join_request_user_id);
create index unit_join_request_decided_by_user_id_idx on public.unit_join_request(unit_join_request_decided_by_user_id);
create index unit_join_request_invitation_id_idx on public.unit_join_request(invitation_id);
create unique index unit_join_request_pending_user_key on public.unit_join_request(tenant_id,unit_id,unit_join_request_user_id) where unit_join_request_status='pending';

create table public.gate (
  gate_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  gate_name text not null, gate_kind public.gate_kind not null, gate_is_active boolean not null default true,
  gate_created_at timestamptz not null default now(), gate_updated_at timestamptz not null default now(),
  constraint gate_tenant_id_gate_id_key unique(tenant_id,gate_id),
  constraint gate_name_check check(length(btrim(gate_name)) between 1 and 100)
);
create table public.gate_guard (
  gate_guard_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  gate_id uuid not null, membership_id uuid not null,
  gate_guard_created_at timestamptz not null default now(), gate_guard_updated_at timestamptz not null default now(),
  constraint gate_guard_tenant_id_gate_id_fkey foreign key(tenant_id,gate_id) references public.gate(tenant_id,gate_id),
  constraint gate_guard_tenant_id_membership_id_fkey foreign key(tenant_id,membership_id) references public.membership(tenant_id,membership_id),
  constraint gate_guard_tenant_id_gate_id_membership_id_key unique(tenant_id,gate_id,membership_id)
);
create index gate_guard_tenant_id_membership_id_idx on public.gate_guard(tenant_id,membership_id);
create table public.device (
  device_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, gate_id uuid not null,
  device_name text not null, device_status public.device_status not null default 'active',
  device_credential_hash text not null unique, device_paired_by_user_id uuid not null references auth.users,
  device_last_sync_at timestamptz,
  device_created_at timestamptz not null default now(), device_updated_at timestamptz not null default now(),
  constraint device_tenant_id_device_id_key unique(tenant_id,device_id),
  constraint device_tenant_id_gate_id_fkey foreign key(tenant_id,gate_id) references public.gate(tenant_id,gate_id),
  constraint device_name_check check(length(btrim(device_name)) between 1 and 100),
  constraint device_credential_hash_check check(device_credential_hash ~ '^[a-f0-9]{64}$')
);
create index device_tenant_id_gate_id_idx on public.device(tenant_id,gate_id);
create index device_paired_by_user_id_idx on public.device(device_paired_by_user_id);
create table public.device_pairing (
  device_pairing_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant, gate_id uuid not null,
  device_pairing_code_hash text not null unique, device_pairing_created_by_user_id uuid not null references auth.users,
  device_pairing_expires_at timestamptz not null, device_pairing_redeemed_at timestamptz, device_id uuid,
  client_event_id uuid not null unique,
  device_pairing_created_at timestamptz not null default now(), device_pairing_updated_at timestamptz not null default now(),
  constraint device_pairing_tenant_id_gate_id_fkey foreign key(tenant_id,gate_id) references public.gate(tenant_id,gate_id),
  constraint device_pairing_tenant_id_device_id_fkey foreign key(tenant_id,device_id) references public.device(tenant_id,device_id),
  constraint device_pairing_expiry_check check(device_pairing_expires_at>device_pairing_created_at and device_pairing_expires_at<=device_pairing_created_at+interval '10 minutes'),
  constraint device_pairing_redemption_check check((device_id is null)=(device_pairing_redeemed_at is null))
);
create index device_pairing_tenant_id_gate_id_idx on public.device_pairing(tenant_id,gate_id);
create index device_pairing_tenant_id_device_id_idx on public.device_pairing(tenant_id,device_id);
create index device_pairing_created_by_user_id_idx on public.device_pairing(device_pairing_created_by_user_id);

create table public.registry_import (
  registry_import_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  registry_import_created_by_user_id uuid not null references auth.users,
  registry_import_status public.registry_import_status not null default 'preview',
  registry_import_row_count integer not null, registry_import_error_count integer not null,
  registry_import_unit_count integer not null default 0, registry_import_resident_count integer not null default 0,
  client_event_id uuid not null unique,
  registry_import_created_at timestamptz not null default now(), registry_import_updated_at timestamptz not null default now(),
  constraint registry_import_tenant_id_registry_import_id_key unique(tenant_id,registry_import_id),
  constraint registry_import_counts_check check(registry_import_row_count between 1 and 8000 and registry_import_error_count>=0)
);
create index registry_import_created_by_user_id_idx on public.registry_import(registry_import_created_by_user_id);
create table public.registry_import_row (
  registry_import_row_id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant,
  registry_import_id uuid not null, registry_import_row_number integer not null,
  registry_import_row_data jsonb not null, registry_import_row_errors jsonb not null,
  registry_import_row_created_at timestamptz not null default now(), registry_import_row_updated_at timestamptz not null default now(),
  constraint registry_import_row_tenant_id_registry_import_id_fkey foreign key(tenant_id,registry_import_id) references public.registry_import(tenant_id,registry_import_id),
  constraint registry_import_row_tenant_id_registry_import_id_number_key unique(tenant_id,registry_import_id,registry_import_row_number),
  constraint registry_import_row_data_check check(jsonb_typeof(registry_import_row_data)='object' and jsonb_typeof(registry_import_row_errors)='array')
);

-- Private transactional retry receipts store a digest, never the original PII or secrets.
create table app_private.registry_operation (
  registry_operation_id uuid primary key default gen_random_uuid(), client_event_id uuid not null unique, tenant_id uuid not null references public.tenant,
  registry_operation_actor_user_id uuid not null, registry_operation_name text not null,
  registry_operation_input_hash text not null, registry_operation_result jsonb not null
);
create index registry_operation_tenant_id_idx on app_private.registry_operation(tenant_id);
alter table app_private.registry_operation enable row level security;
create policy "registry capability can read receipts" on app_private.registry_operation for select to registry_writer using(true);
create policy "registry capability can create receipts" on app_private.registry_operation for insert to registry_writer with check(true);
revoke all on app_private.registry_operation from public,anon,authenticated,service_role;
grant select,insert on app_private.registry_operation to registry_writer;
create table app_private.registry_attempt (
  registry_attempt_id uuid primary key default gen_random_uuid(), registry_attempt_scope_code text not null unique, registry_attempt_started_at timestamptz not null,
  registry_attempt_count integer not null
);
alter table app_private.registry_attempt enable row level security;
revoke all on app_private.registry_attempt from public,anon,authenticated,service_role,registry_writer;

-- All tenant entities use only RPC writes; the capability cannot be assumed by a client or service role.
do $$ declare table_name text; begin
  foreach table_name in array array['unit','unit_resident','membership_household_permission','vehicle','pet',
    'unit_join_code','unit_join_request','gate','gate_guard','device','device_pairing','registry_import','registry_import_row'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant select,insert,update,delete on public.%I to registry_writer',table_name);
    execute format('create policy "registry capability can read records" on public.%I for select to registry_writer using(true)',table_name);
    execute format('create policy "registry capability can create records" on public.%I for insert to registry_writer with check(true)',table_name);
    execute format('create policy "registry capability can update records" on public.%I for update to registry_writer using(true) with check(true)',table_name);
    execute format('create policy "registry capability can remove records" on public.%I for delete to registry_writer using(true)',table_name);
    execute format('create trigger maintain_row_metadata before insert or update on public.%I for each row execute function app_private.maintain_row_metadata()',table_name);
    execute format('alter table public.%I enable always trigger maintain_row_metadata',table_name);
  end loop;
end $$;
-- Never expose credential digests, even to managers. These tables are read through safe RPC results only.
revoke select on public.unit_join_code,public.device_pairing from authenticated;
revoke select on public.device from authenticated;
grant select(device_id,tenant_id,gate_id,device_name,device_status,device_paired_by_user_id,device_last_sync_at,device_created_at,device_updated_at) on public.device to authenticated;
grant select on public.tenant,public.person,public.membership,public.invitation to registry_writer;
grant insert on public.person,public.invitation to registry_writer;
grant update(person_first_name,person_last_name,person_document_type,person_document_number,person_email,person_phone,person_birth_date) on public.person to registry_writer;
grant update(invitation_token_hash,invitation_status,invitation_delivered_at) on public.invitation to registry_writer;
grant update(membership_status,membership_valid_to,unit_id) on public.membership to registry_writer;
-- Household approval may add a role to an already-consenting user in the SAME household only (checked by RPC).
grant insert on public.membership to registry_writer;
do $$ declare table_name text; begin
  foreach table_name in array array['person','membership','invitation'] loop
    execute format('create policy "registry capability can read records" on public.%I for select to registry_writer using(true)',table_name);
    execute format('create policy "registry capability can create records" on public.%I for insert to registry_writer with check(true)',table_name);
    execute format('create policy "registry capability can update records" on public.%I for update to registry_writer using(true) with check(true)',table_name);
  end loop;
end $$;
create policy "registry capability can read tenant configuration" on public.tenant for select to registry_writer using(true);
