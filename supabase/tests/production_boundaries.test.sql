begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

select ok(
  not pg_catalog.has_table_privilege('anon', 'public.private_state_events', 'SELECT')
  and not pg_catalog.has_table_privilege('anon', 'public.private_state_events', 'INSERT')
  and not pg_catalog.has_table_privilege('anon', 'public.private_app_states', 'SELECT'),
  'anon has no direct private-state privileges'
);

select ok(
  not pg_catalog.has_table_privilege('authenticated', 'public.concierge_connections', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.concierge_proposal_runs', 'SELECT'),
  'browser roles cannot read server-only concierge tables'
);

select ok(
  exists (select 1 from pg_catalog.pg_constraint where conname = 'private_app_states_state_size' and convalidated),
  'private notebook payload size is bounded'
);
select ok(
  exists (select 1 from pg_catalog.pg_constraint where conname = 'travel_plans_payload_size' and convalidated),
  'shared travel payload size is bounded'
);
select ok(
  exists (select 1 from pg_catalog.pg_constraint where conname = 'travel_plans_payload_shape' and convalidated),
  'shared travel payload has a server-side shape and URL boundary'
);
select ok(
  not private.valid_public_travel_payload('{"kind":"travel","id":"trip","destinations":[],"days":[],"stays":[],"references":[{"url":"javascript:alert(1)"}],"travelNotes":[],"packingItems":[]}'::jsonb),
  'server-side validation rejects executable shared URLs'
);
select ok(
  exists (select 1 from pg_catalog.pg_constraint where conname = 'concierge_proposal_runs_bundle_size' and convalidated),
  'concierge proposal payload size is bounded'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.concierge_rate_limits'::regclass),
  'concierge rate-limit state has RLS enabled'
);
select ok(
  not pg_catalog.has_table_privilege('anon', 'public.concierge_rate_limits', 'SELECT')
  and not pg_catalog.has_table_privilege('authenticated', 'public.concierge_rate_limits', 'SELECT'),
  'browser roles cannot read rate-limit state'
);
select ok(
  not pg_catalog.has_function_privilege('anon', 'public.take_concierge_rate_limit(text,integer,integer)', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'public.take_concierge_rate_limit(text,integer,integer)', 'EXECUTE')
  and pg_catalog.has_function_privilege('service_role', 'public.take_concierge_rate_limit(text,integer,integer)', 'EXECUTE'),
  'only the server role can consume a concierge rate limit'
);
select ok(
  public.take_concierge_rate_limit(repeat('a', 64), 2, 60),
  'the first bounded concierge request is allowed'
);
select ok(
  public.take_concierge_rate_limit(repeat('a', 64), 2, 60)
  and not public.take_concierge_rate_limit(repeat('a', 64), 2, 60),
  'requests over the per-subject window are rejected'
);

insert into auth.users (id, email, created_at, updated_at, is_anonymous) values
  ('41000000-0000-0000-0000-000000000001', 'boundary-one@example.invalid', now(), now(), false),
  ('41000000-0000-0000-0000-000000000002', 'boundary-two@example.invalid', now(), now(), false),
  ('41000000-0000-0000-0000-000000000003', null, now(), now(), true);

insert into public.private_app_states (user_id, state) values
  ('41000000-0000-0000-0000-000000000001', '{"journey":{"id":"one"}}'),
  ('41000000-0000-0000-0000-000000000002', '{"journey":{"id":"two"}}'),
  ('41000000-0000-0000-0000-000000000003', '{"journey":{"id":"guest"}}');

set local role authenticated;
set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated","is_anonymous":false}';

select is(
  (select count(*)::integer from public.private_app_states),
  1,
  'a signed-in user can read only their private notebook'
);
select is(
  (select count(*)::integer from public.private_app_states where user_id = '41000000-0000-0000-0000-000000000002'),
  0,
  'changing an object id cannot read another private notebook'
);
select is(
  (with changed as (
    update public.private_app_states set state = '{"journey":{"id":"stolen"}}'
    where user_id = '41000000-0000-0000-0000-000000000002'
    returning 1
  ) select count(*)::integer from changed),
  0,
  'changing an object id cannot update another private notebook'
);
select is(
  (select count(*)::integer from public.profiles where user_id = '41000000-0000-0000-0000-000000000002'),
  0,
  'profiles are isolated by user id'
);

set local "request.jwt.claims" = '{"sub":"41000000-0000-0000-0000-000000000003","role":"authenticated","is_anonymous":true}';

select is(
  (select count(*)::integer from public.private_app_states),
  0,
  'an anonymous travel guest cannot read a private notebook'
);
select is(
  (select count(*)::integer from public.profiles),
  0,
  'an anonymous travel guest cannot read a profile'
);

reset role;
select * from finish();
rollback;
