-- M01-F02: a user whose only memberships are in cancelled tenants must learn why they cannot enter.
-- Cancelled tenants are (correctly) invisible to RLS, so this narrow definer function discloses just the caller's
-- OWN active memberships' tenant id and name. It consumes the central identity validator and is empty for support
-- tokens, so impersonation can never be used to learn about cancelled memberships.
create function public.current_user_cancelled_tenants()
returns table (tenant_id uuid, tenant_name text)
language sql stable security definer set search_path = '' as $$
  select distinct t.tenant_id, t.tenant_name
  from public.tenant t
    join public.membership m on m.tenant_id = t.tenant_id
    join public.person p on p.tenant_id = m.tenant_id and p.person_id = m.person_id
  where app_private.current_identity_is_valid()
    and not app_private.is_impersonating()
    and p.user_id = app_private.current_user_id()
    and t.tenant_subscription_status = 'cancelled'
    and m.membership_status = 'active'
    and m.membership_valid_from <= now()
    and (m.membership_valid_to is null or now() < m.membership_valid_to)
  order by t.tenant_name, t.tenant_id;
$$;
revoke all on function public.current_user_cancelled_tenants() from public, anon, service_role;
grant execute on function public.current_user_cancelled_tenants() to authenticated;
