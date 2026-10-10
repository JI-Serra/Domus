-- M01-F04: a platform administrator has no standing registry access, so choosing the user to support needs a
-- dedicated, minimized and audited lookup. It exposes only user id, first/last name and role of ACTIVE memberships
-- (never email, document, phone or birth date), excludes platform administrators, and records every call.

-- Audit entry point for the lookup. Owned by the dedicated audit writer (the only role allowed to append to
-- audit_event); callable only by the owner of the public RPC. The search TERM is never stored, only its length.
create function app_private.record_support_target_lookup(
  actor_user_id uuid, lookup_tenant_id uuid, search_length integer, result_count integer) returns void
language plpgsql security definer set search_path = '' as $$
declare headers jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when invalid_text_representation then headers := null;
  end;
  insert into public.audit_event (
    tenant_id, audit_event_actor_user_id, audit_event_db_role, audit_event_action, audit_event_table_name,
    audit_event_row_id, audit_event_diff, audit_event_request_ip, audit_event_request_device
  ) values (
    lookup_tenant_id, actor_user_id, 'authenticated', 'insert', 'support_target_lookup', gen_random_uuid(),
    jsonb_build_object('support_target_lookup_search_length', search_length,
      'support_target_lookup_result_count', result_count),
    left(nullif(btrim(split_part(headers ->> 'x-forwarded-for', ',', 1)), ''), 256),
    left(headers ->> 'x-device-id', 256));
end;
$$;
revoke all on function app_private.record_support_target_lookup(uuid, uuid, integer, integer)
  from public, anon, authenticated, service_role;
grant create on schema app_private to audit_writer;
alter function app_private.record_support_target_lookup(uuid, uuid, integer, integer) owner to audit_writer;
revoke create on schema app_private from audit_writer;
set role audit_writer;
grant execute on function app_private.record_support_target_lookup(uuid, uuid, integer, integer) to postgres;
reset role;

create function public.list_support_targets(target_tenant_id uuid, search text default null)
returns table (user_id uuid, person_first_name text, person_last_name text, membership_role public.membership_role)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  term text := nullif(btrim(search), '');
  pattern text;
  result jsonb;
begin
  -- Authorize first. Support tokens fail is_platform_admin(), so they get the same denial as ordinary users.
  if not app_private.is_platform_admin() then
    raise exception 'MFA platform administrator required' using errcode = '42501'; end if;
  if not exists (select 1 from public.tenant t where t.tenant_id = target_tenant_id
    and t.tenant_subscription_status <> 'cancelled') then
    raise exception 'Support target lookup denied' using errcode = '42501'; end if;
  if term is not null and length(term) > 100 then
    raise exception 'Invalid support target search' using errcode = '22023'; end if;
  if term is not null then
    pattern := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.person_last_name, q.person_first_name, q.membership_role), '[]'::jsonb)
    into result
    from (
      select p.user_id, p.person_first_name, p.person_last_name, m.membership_role
      from public.person p
        join public.membership m on m.tenant_id = p.tenant_id and m.person_id = p.person_id
      where p.tenant_id = target_tenant_id and p.user_id is not null
        and m.membership_status = 'active' and m.membership_valid_from <= now()
        and (m.membership_valid_to is null or now() < m.membership_valid_to)
        and not exists (select 1 from public.platform_admin a where a.user_id = p.user_id)
        and (pattern is null or (p.person_first_name || ' ' || p.person_last_name) ilike pattern escape '\')
      order by p.person_last_name, p.person_first_name, m.membership_role
      limit 50) q;
  perform app_private.record_support_target_lookup(app_private.current_user_id(), target_tenant_id,
    coalesce(length(term), 0), jsonb_array_length(result));
  return query select (e.item ->> 'user_id')::uuid, e.item ->> 'person_first_name', e.item ->> 'person_last_name',
    (e.item ->> 'membership_role')::public.membership_role
    from jsonb_array_elements(result) with ordinality e(item, position) order by e.position;
end;
$$;
revoke all on function public.list_support_targets(uuid, text) from public, anon, service_role;
grant execute on function public.list_support_targets(uuid, text) to authenticated;
