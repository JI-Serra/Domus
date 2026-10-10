-- Even directly callable policy helpers reveal only authorized tenant IDs.
-- Avoid calling member_tenant_ids here: that helper consumes this set.
create or replace function app_private.identity_tenant_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select t.tenant_id from public.tenant t where app_private.current_identity_is_valid()
    and (app_private.is_platform_admin() or (
      t.tenant_subscription_status <> 'cancelled'
      and exists(select 1 from public.membership m join public.person p using(tenant_id,person_id)
        where m.tenant_id=t.tenant_id and p.user_id=app_private.current_user_id()
          and m.membership_status='active' and m.membership_valid_from<=now()
          and (m.membership_valid_to is null or now()<m.membership_valid_to))
      and (not app_private.is_impersonating()
        or t.tenant_id=((select auth.jwt())->>'support_tenant_id')::uuid)));
$$;
