-- Keep public-schema objects deny-by-default and bound the largest user-controlled
-- JSON documents. Existing production rows were checked before this migration:
-- the largest state was below 170 KB, well under the 2 MiB ceiling.

revoke all on table public.profiles from anon;
revoke all on table public.private_app_states from anon;
revoke all on table public.private_state_events from anon;
revoke all on table public.concierge_connections from anon, authenticated;
revoke all on table public.concierge_proposal_runs from anon, authenticated;
revoke all on table public.telegram_pair_codes from anon, authenticated;
revoke all on table public.telegram_links from anon, authenticated;
revoke all on table public.telegram_requests from anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
for select to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);
create policy profiles_update_own on public.profiles
for update to authenticated
using (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
)
with check (
  user_id = (select auth.uid())
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
);

create or replace function private.safe_shared_url(value text, allow_empty boolean default true)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when value is null or btrim(value) = '' then allow_empty
    else octet_length(value) <= 4000
      and value ~* '^https?://[^[:space:]<>]+$'
      and value !~* '^https?://[^/?#]*@'
      and value !~* '[?&](access[_-]?token|api[_-]?key|apikey|auth|key|password|secret|signature|token)='
  end;
$$;

create or replace function private.valid_public_travel_payload(value jsonb)
returns boolean
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  item jsonb;
  nested jsonb;
begin
  if jsonb_typeof(value) is distinct from 'object'
    or not (value ?& array['id', 'kind', 'title', 'destinations', 'startDate', 'endDate', 'travelers', 'budget', 'currency', 'notes', 'days', 'stays', 'references', 'travelNotes', 'packingItems', 'createdAt', 'updatedAt'])
    or value - array['id', 'kind', 'title', 'destinations', 'startDate', 'endDate', 'travelers', 'budget', 'currency', 'notes', 'days', 'stays', 'references', 'travelNotes', 'packingItems', 'createdAt', 'updatedAt']::text[] <> '{}'::jsonb
    or value ->> 'kind' <> 'travel'
    or nullif(btrim(value ->> 'id'), '') is null
    or jsonb_typeof(value -> 'destinations') is distinct from 'array'
    or jsonb_typeof(value -> 'days') is distinct from 'array'
    or jsonb_typeof(value -> 'stays') is distinct from 'array'
    or jsonb_typeof(value -> 'references') is distinct from 'array'
    or jsonb_typeof(value -> 'travelNotes') is distinct from 'array'
    or jsonb_typeof(value -> 'packingItems') is distinct from 'array'
    or jsonb_array_length(value -> 'destinations') not between 1 and 20
    or jsonb_array_length(value -> 'days') > 370
    or jsonb_array_length(value -> 'stays') > 100
    or jsonb_array_length(value -> 'references') > 100
    or jsonb_array_length(value -> 'travelNotes') > 200
    or jsonb_array_length(value -> 'packingItems') > 500 then
    return false;
  end if;

  for item in select candidate.entry from jsonb_array_elements(value -> 'destinations') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'string' or octet_length(item #>> '{}') > 800 then return false; end if;
  end loop;

  for item in select candidate.entry from jsonb_array_elements(value -> 'days') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'date', 'title', 'activities']::text[] <> '{}'::jsonb
      or jsonb_typeof(item -> 'activities') is distinct from 'array'
      or jsonb_array_length(item -> 'activities') > 100 then return false; end if;
    for nested in select candidate.entry from jsonb_array_elements(item -> 'activities') as candidate(entry) loop
      if jsonb_typeof(nested) is distinct from 'object'
        or nested - array['id', 'time', 'title', 'kind', 'location', 'mapsUrl', 'durationMinutes', 'cost', 'booked', 'notes', 'imageUrl', 'imageAlt', 'imageSourceLabel', 'imageSourceUrl']::text[] <> '{}'::jsonb
        or not private.safe_shared_url(nested ->> 'mapsUrl')
        or not private.safe_shared_url(nested ->> 'imageUrl')
        or not private.safe_shared_url(nested ->> 'imageSourceUrl') then return false; end if;
    end loop;
  end loop;

  for item in select candidate.entry from jsonb_array_elements(value -> 'stays') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'name', 'checkIn', 'checkOut', 'area', 'address', 'mapsUrl', 'sourceUrl', 'imageUrl', 'imageAlt', 'summary', 'highlights', 'notes']::text[] <> '{}'::jsonb
      or not private.safe_shared_url(item ->> 'mapsUrl')
      or not private.safe_shared_url(item ->> 'sourceUrl')
      or not private.safe_shared_url(item ->> 'imageUrl') then return false; end if;
  end loop;

  for item in select candidate.entry from jsonb_array_elements(value -> 'references') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'label', 'kind', 'url', 'description']::text[] <> '{}'::jsonb
      or not private.safe_shared_url(item ->> 'url', false) then return false; end if;
  end loop;

  for item in select candidate.entry from jsonb_array_elements(value -> 'travelNotes') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'title', 'details', 'category', 'important', 'date', 'priority']::text[] <> '{}'::jsonb then return false; end if;
  end loop;

  for item in select candidate.entry from jsonb_array_elements(value -> 'packingItems') as candidate(entry) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item - array['id', 'name', 'category', 'quantity', 'packed', 'notes']::text[] <> '{}'::jsonb then return false; end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function private.safe_shared_url(text, boolean) from public, anon, authenticated;
revoke all on function private.valid_public_travel_payload(jsonb) from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.valid_public_travel_payload(jsonb) to authenticated, service_role;

alter table public.profiles
  add constraint profiles_display_name_size check (octet_length(display_name) <= 320) not valid,
  add constraint profiles_avatar_url_size check (avatar_url is null or octet_length(avatar_url) <= 2048) not valid;
alter table public.private_app_states
  add constraint private_app_states_state_size check (octet_length(state::text) <= 2097152) not valid;
alter table public.travel_plans
  add constraint travel_plans_payload_size check (octet_length(payload::text) <= 2097152) not valid,
  add constraint travel_plans_payload_shape check (private.valid_public_travel_payload(payload)) not valid;
alter table public.concierge_proposal_runs
  add constraint concierge_proposal_runs_bundle_size check (octet_length(bundle::text) <= 2097152) not valid;

alter table public.profiles validate constraint profiles_display_name_size;
alter table public.profiles validate constraint profiles_avatar_url_size;
alter table public.private_app_states validate constraint private_app_states_state_size;
alter table public.travel_plans validate constraint travel_plans_payload_size;
alter table public.travel_plans validate constraint travel_plans_payload_shape;
alter table public.concierge_proposal_runs validate constraint concierge_proposal_runs_bundle_size;

create table public.concierge_rate_limits (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table public.concierge_rate_limits enable row level security;
revoke all on table public.concierge_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.concierge_rate_limits to service_role;

create policy concierge_rate_limits_no_direct_access on public.concierge_rate_limits
for all to authenticated using (false) with check (false);

create or replace function public.take_concierge_rate_limit(
  requested_subject_hash text,
  requested_limit integer default 120,
  requested_window_seconds integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
  cutoff timestamptz;
begin
  if requested_subject_hash !~ '^[0-9a-f]{64}$'
    or requested_limit not between 1 and 1000
    or requested_window_seconds not between 60 and 3600 then
    raise exception 'invalid_rate_limit_request';
  end if;

  cutoff := now() - make_interval(secs => requested_window_seconds);
  insert into public.concierge_rate_limits as item (
    subject_hash, window_started_at, request_count, updated_at
  ) values (
    requested_subject_hash, now(), 1, now()
  )
  on conflict (subject_hash) do update
    set window_started_at = case when item.window_started_at <= cutoff then now() else item.window_started_at end,
        request_count = case when item.window_started_at <= cutoff then 1 else item.request_count + 1 end,
        updated_at = now()
  returning request_count <= requested_limit into allowed;

  delete from public.concierge_rate_limits
  where updated_at < now() - interval '1 day';
  return allowed;
end;
$$;

revoke all on function public.take_concierge_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.take_concierge_rate_limit(text, integer, integer) to service_role;
