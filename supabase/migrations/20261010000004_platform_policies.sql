-- M01: row-level security for the platform tables, the consent capability and the private tenant-logo bucket.
-- Client policies use uncorrelated set-returning helpers only.
create policy "invitation managers can read invitations" on public.invitation for select to authenticated
  using ((select app_private.is_platform_admin()) or
    (tenant_id in (select app_private.permission_tenant_ids('admin_management')) and invitation_membership_role='tenant_admin') or
    (tenant_id in (select app_private.permission_tenant_ids('registry')) and invitation_membership_role<>'tenant_admin'));
create policy "audit admins can read support sessions" on public.support_session for select to authenticated
  using (not (select app_private.is_impersonating()) and ((select app_private.is_platform_admin())
    or tenant_id in (select app_private.permission_tenant_ids('access_audit'))));

-- The consent capability (owner of accept_invitation only) reads and writes exactly the consent records.
create policy "invitation acceptor can read consent records" on public.person for select to invitation_acceptor using (true);
create policy "invitation acceptor can read consent records" on public.membership for select to invitation_acceptor using (true);
create policy "invitation acceptor can read consent records" on public.membership_permission for select to invitation_acceptor using (true);
create policy "invitation acceptor can read consent records" on public.invitation for select to invitation_acceptor using (true);
create policy "invitation acceptor can create consent records" on public.person for insert to invitation_acceptor with check (true);
create policy "invitation acceptor can create consent records" on public.membership for insert to invitation_acceptor with check (true);
create policy "invitation acceptor can create consent records" on public.membership_permission for insert to invitation_acceptor with check (true);
create policy "invitation acceptor can read tenant status" on public.tenant for select to invitation_acceptor using(true);
create policy "invitation acceptor can bind own identity" on public.person for update to invitation_acceptor using(true) with check(true);
create policy "invitation acceptor can close consent" on public.invitation for update to invitation_acceptor using(true) with check(true);
create policy "invitation acceptor can lock granted memberships" on public.membership for update
  to invitation_acceptor using(true) with check(true);

-- Private bucket. First object path component must be the canonical tenant UUID.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('tenant-logo','tenant-logo',false,2097152,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy "members can read tenant logos" on storage.objects for select to authenticated
  using(bucket_id='tenant-logo' and ((storage.foldername(name))[1] in (select app_private.member_tenant_ids()::text)
    or ((select app_private.is_platform_admin()) and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text))));
create policy "platform admins can upload tenant logos" on storage.objects for insert to authenticated
  with check(bucket_id='tenant-logo' and (select app_private.is_platform_admin())
    and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text));
create policy "platform admins can update tenant logos" on storage.objects for update to authenticated
  using(bucket_id='tenant-logo' and (select app_private.is_platform_admin()))
  with check(bucket_id='tenant-logo' and (select app_private.is_platform_admin())
    and (storage.foldername(name))[1] in (select app_private.identity_tenant_ids()::text));
create policy "platform admins can delete tenant logos" on storage.objects for delete to authenticated
  using(bucket_id='tenant-logo' and (select app_private.is_platform_admin()));
