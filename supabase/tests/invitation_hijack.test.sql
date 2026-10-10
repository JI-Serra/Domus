-- H1 (reports/T10-security-review-M01.md): an invitation for a person who is already bound to another account must
-- never attach its role or permissions to that account; acceptance only ever binds and grants to the caller.
-- This file uses only objects that also existed at the reviewed commit (96e8f23), so it can be replayed there,
-- where it fails (see reports/T12-fixes.md).
begin;
select no_plan();
create function pg_temp.email_session(sub text) returns text language sql stable as $$
  select jsonb_build_object('sub',sub,'role','authenticated','aal','aal1',
    'amr',jsonb_build_array(jsonb_build_object('method','otp','timestamp',floor(extract(epoch from now())))))::text $$;
grant execute on function pg_temp.email_session(text) to authenticated;

-- Fictional accounts: 13 is the real invitee (a1), 14 the registry insider's alternate account (a2), 15 a second
-- legitimate invitee.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
  raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),
  '{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''
from (values ('20000000-0000-0000-0000-000000000013'::uuid,'legit.invitee@example.test'),
  ('20000000-0000-0000-0000-000000000014'::uuid,'attacker.alt@example.test'),
  ('20000000-0000-0000-0000-000000000015'::uuid,'second.invitee@example.test'),
  ('20000000-0000-0000-0000-000000000016'::uuid,'other.account@example.test')) accounts(id,email);
-- Unbound people from the registry (padron) of tenant A.
insert into public.person(person_id,tenant_id,person_first_name,person_last_name) values
  ('30000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','Paula','Padron'),
  ('30000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','Quique','Padron'),
  ('30000000-0000-0000-0000-0000000000a3','10000000-0000-0000-0000-000000000001','Rita','Padron');

-- Exact T10 exploit. Step 1: an admin_management admin (user 2) invites P as tenant_admin with access_audit, finance
-- and admin_management. Step 2: the registry-only admin (user 12) invites the SAME P as household_member, addressed
-- to an alternate email they control. Both rows are inserted as fixtures so the race state exists regardless of
-- whether create_invitation would still allow the second one.
insert into public.invitation(invitation_id,tenant_id,invitation_email,person_id,invitation_membership_role,
  invitation_admin_permissions,invitation_token_hash,invitation_expires_at,invitation_created_by_user_id,client_event_id)
values
  ('90000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001','legit.invitee@example.test',
    '30000000-0000-0000-0000-0000000000a1','tenant_admin','{access_audit,finance,admin_management}',
    encode(extensions.digest(repeat('1',64),'sha256'),'hex'),now()+interval '1 day',
    '20000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-0000000000a1'),
  ('90000000-0000-0000-0000-0000000000a2','10000000-0000-0000-0000-000000000001','attacker.alt@example.test',
    '30000000-0000-0000-0000-0000000000a1','household_member','{}',
    encode(extensions.digest(repeat('2',64),'sha256'),'hex'),now()+interval '1 day',
    '20000000-0000-0000-0000-000000000012','91000000-0000-0000-0000-0000000000a2');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000012","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select is((select count(*) from public.invitation where invitation_membership_role='tenant_admin'),0::bigint,
  'Registry-only admin cannot see admin invitations (the attack is blind)');
reset role;
-- Step 3: the alternate account accepts first and binds P.
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000014'),true);
set local role authenticated;
select lives_ok($$select public.accept_invitation(repeat('2',64))$$,'Alternate account binds P through its own invitation');
reset role;
-- Step 4: the real invitee accepts the admin invitation. It must fail with the uniform error.
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000013'),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('1',64))$$,'42501','Invitation unavailable',
  'Admin invitation for a person bound to another account fails uniformly');
reset role;
select is((select count(*) from public.membership where person_id='30000000-0000-0000-0000-0000000000a1'
  and membership_role='tenant_admin'),0::bigint,'No admin membership lands on the bound person');
select is((select count(*) from public.membership_permission mp join public.membership m using(tenant_id,membership_id)
  join public.person p using(tenant_id,person_id) where p.user_id='20000000-0000-0000-0000-000000000014'),0::bigint,
  'Attacker alternate account holds no admin permission');
select is((select count(*) from public.membership m join public.person p using(tenant_id,person_id)
  where p.user_id='20000000-0000-0000-0000-000000000013'),0::bigint,'Real invitee received nothing');
select is((select user_id from public.person where person_id='30000000-0000-0000-0000-0000000000a1'),
  '20000000-0000-0000-0000-000000000014'::uuid,'P stays bound to the account that accepted first');
select is((select invitation_status::text from public.invitation where invitation_id='90000000-0000-0000-0000-0000000000a1'),
  'revoked','Binding P revoked the competing pending invitation');
select is((select invitation_accepted_by_user_id from public.invitation where invitation_id='90000000-0000-0000-0000-0000000000a1'),
  null::uuid,'The admin invitation is not recorded as accepted by anyone');

-- Variant: the legitimate invitee accepts first; the competing invitation then dies.
insert into public.invitation(invitation_id,tenant_id,invitation_email,person_id,invitation_membership_role,
  invitation_admin_permissions,invitation_token_hash,invitation_expires_at,invitation_created_by_user_id,client_event_id)
values
  ('90000000-0000-0000-0000-0000000000b1','10000000-0000-0000-0000-000000000001','second.invitee@example.test',
    '30000000-0000-0000-0000-0000000000a2','tenant_admin','{access_audit,finance,admin_management}',
    encode(extensions.digest(repeat('3',64),'sha256'),'hex'),now()+interval '1 day',
    '20000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-0000000000b1'),
  ('90000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001','attacker.alt@example.test',
    '30000000-0000-0000-0000-0000000000a2','household_member','{}',
    encode(extensions.digest(repeat('4',64),'sha256'),'hex'),now()+interval '1 day',
    '20000000-0000-0000-0000-000000000012','91000000-0000-0000-0000-0000000000b2');
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000015'),true);
set local role authenticated;
select lives_ok($$select public.accept_invitation(repeat('3',64))$$,'Legitimate invitee accepts the admin invitation first');
reset role;
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000014'),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('4',64))$$,'42501','Invitation unavailable',
  'Competing invitation for an already bound person fails uniformly');
reset role;
select is((select count(*) from public.membership_permission mp join public.membership m using(tenant_id,membership_id)
  join public.person p using(tenant_id,person_id) where p.user_id='20000000-0000-0000-0000-000000000015'),3::bigint,
  'Legitimate invitee holds exactly the three granted permissions');
select is((select count(*) from public.membership where person_id='30000000-0000-0000-0000-0000000000a2'),1::bigint,
  'Only the legitimate membership exists on the person');

-- Variant: the person was bound through another path after the invitation was created.
insert into public.invitation(invitation_id,tenant_id,invitation_email,person_id,invitation_membership_role,
  invitation_admin_permissions,invitation_token_hash,invitation_expires_at,invitation_created_by_user_id,client_event_id)
values ('90000000-0000-0000-0000-0000000000c1','10000000-0000-0000-0000-000000000001','legit.invitee@example.test',
  '30000000-0000-0000-0000-0000000000a3','tenant_admin','{finance}',
  encode(extensions.digest(repeat('5',64),'sha256'),'hex'),now()+interval '1 day',
  '20000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-0000000000c1');
update public.person set user_id='20000000-0000-0000-0000-000000000016' where person_id='30000000-0000-0000-0000-0000000000a3';
select set_config('request.jwt.claims',pg_temp.email_session('20000000-0000-0000-0000-000000000013'),true);
set local role authenticated;
select throws_ok($$select public.accept_invitation(repeat('5',64))$$,'42501','Invitation unavailable',
  'Invitation for a person bound after creation fails uniformly');
reset role;
select is((select count(*) from public.membership where person_id='30000000-0000-0000-0000-0000000000a3'),0::bigint,
  'Nothing is granted to the account the person was bound to');

-- Invariant over every acceptance in this file (and the seed): the bound person belongs to the acceptor.
select is((select count(*) from public.invitation i join public.person p on (p.tenant_id,p.person_id)=(i.tenant_id,i.person_id)
  where i.invitation_status='accepted' and p.user_id is distinct from i.invitation_accepted_by_user_id),0::bigint,
  'Every accepted invitation is bound to its accepting account');
select * from finish();
rollback;
