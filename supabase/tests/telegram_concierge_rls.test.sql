begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.telegram_pair_codes'::regclass),
  true,
  'telegram_pair_codes has RLS enabled'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.telegram_links'::regclass),
  true,
  'telegram_links has RLS enabled'
);
select is(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.telegram_requests'::regclass),
  true,
  'telegram_requests has RLS enabled'
);

create temporary table telegram_test_roles (role_name name) on commit drop;
insert into telegram_test_roles values ('anon'), ('authenticated');

create temporary table telegram_test_tables (table_name text) on commit drop;
insert into telegram_test_tables values
  ('public.telegram_pair_codes'),
  ('public.telegram_links'),
  ('public.telegram_requests');

select ok(
  not pg_catalog.has_table_privilege(role_name, table_name, 'SELECT')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'INSERT')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'UPDATE')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'DELETE')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'TRUNCATE')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'REFERENCES')
  and not pg_catalog.has_table_privilege(role_name, table_name, 'TRIGGER'),
  format('%s has no table privileges on %s', role_name, table_name)
)
from telegram_test_roles
cross join telegram_test_tables
order by role_name, table_name;

select ok(
  pg_catalog.has_table_privilege('service_role', table_name, 'SELECT')
  and pg_catalog.has_table_privilege('service_role', table_name, 'INSERT')
  and pg_catalog.has_table_privilege('service_role', table_name, 'UPDATE')
  and pg_catalog.has_table_privilege('service_role', table_name, 'DELETE'),
  format('service_role has server CRUD privileges on %s', table_name)
)
from telegram_test_tables
order by table_name;

create temporary table telegram_test_functions (signature text) on commit drop;
insert into telegram_test_functions values
  ('public.consume_telegram_pair_code(text,bigint,bigint)'),
  ('public.enqueue_telegram_request(bigint,bigint,bigint,bigint,bigint,text,text)'),
  ('public.claim_telegram_requests(uuid,text,integer,integer)'),
  ('public.clarify_telegram_request(uuid,uuid,text,bigint,text)'),
  ('public.complete_telegram_requests(uuid,uuid[],text,text,text,text)'),
  ('public.fail_telegram_requests(uuid,uuid[],text,text)'),
  ('public.revoke_telegram_connection(uuid)'),
  ('public.cleanup_expired_telegram_requests()');

select ok(
  not exists (
    select 1
    from pg_catalog.aclexplode(coalesce(
      (select proacl from pg_catalog.pg_proc where oid = signature::regprocedure),
      pg_catalog.acldefault('f', (select proowner from pg_catalog.pg_proc where oid = signature::regprocedure))
    )) as privilege
    where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
  ),
  format('PUBLIC cannot execute %s', signature)
)
from telegram_test_functions
order by signature;

select ok(
  not pg_catalog.has_function_privilege('anon', signature, 'EXECUTE'),
  format('anon cannot execute %s', signature)
)
from telegram_test_functions
order by signature;

select ok(
  not pg_catalog.has_function_privilege('authenticated', signature, 'EXECUTE'),
  format('authenticated cannot execute %s', signature)
)
from telegram_test_functions
order by signature;

select ok(
  pg_catalog.has_function_privilege('service_role', signature, 'EXECUTE'),
  format('service_role can execute %s', signature)
)
from telegram_test_functions
order by signature;

select * from finish();
rollback;
