-- UX routing only: this is not an authorization primitive.
create function public.current_user_is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select app_private.current_identity_is_valid() and not app_private.is_impersonating()
    and exists(select 1 from public.platform_admin a where a.user_id=app_private.current_user_id() and a.platform_admin_is_active);
$$;
revoke all on function public.current_user_is_platform_admin() from public,anon,service_role;
grant execute on function public.current_user_is_platform_admin() to authenticated;

