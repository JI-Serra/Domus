-- Session lifecycle events carry the same explicit actor/target/session context
-- as tenant writes, including when the actor ends via their ordinary token.
grant create on schema app_private to audit_writer;
set role audit_writer;
do $$ declare body text; begin
  body:=pg_get_functiondef('app_private.audit_row_change()'::regprocedure);
  body:=replace(body,
    'case when app_private.is_impersonating() then app_private.current_user_id() end, app_private.current_support_session_id()',
    'case when tg_table_name=''support_session'' then (row_data->>''support_session_target_user_id'')::uuid when app_private.is_impersonating() then app_private.current_user_id() end, case when tg_table_name=''support_session'' then (row_data->>''support_session_id'')::uuid else app_private.current_support_session_id() end');
  execute body;
end $$;
reset role;
revoke create on schema app_private from audit_writer;
