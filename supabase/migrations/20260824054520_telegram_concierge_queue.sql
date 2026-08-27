create extension if not exists pg_cron with schema pg_catalog;

create table public.telegram_pair_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_id text not null,
  connection_id uuid not null references public.concierge_connections(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_id text not null,
  connection_id uuid not null references public.concierge_connections(id) on delete cascade,
  telegram_user_id bigint not null,
  telegram_chat_id bigint not null,
  linked_at timestamptz not null default now(),
  last_received_at timestamptz,
  revoked_at timestamptz
);

create unique index telegram_links_active_connection_idx
on public.telegram_links(connection_id)
where revoked_at is null;

create unique index telegram_links_active_account_idx
on public.telegram_links(telegram_user_id)
where revoked_at is null;

create unique index telegram_links_active_chat_idx
on public.telegram_links(telegram_chat_id)
where revoked_at is null;

create index telegram_links_user_idx
on public.telegram_links(user_id, linked_at desc);

create table public.telegram_requests (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.telegram_links(id) on delete cascade,
  update_id bigint not null unique,
  telegram_message_id bigint not null,
  parent_request_id uuid references public.telegram_requests(id) on delete set null,
  bot_prompt_message_id bigint,
  raw_text text,
  raw_hash text not null,
  status text not null default 'queued'
    check (status in ('queued', 'leased', 'awaiting_clarification', 'processed', 'no_change', 'failed', 'expired')),
  lease_id text,
  lease_expires_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 3),
  result_run_key text,
  result_summary text,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (raw_text is null or char_length(raw_text) between 1 and 4096),
  check ((status = 'leased') = (lease_id is not null and lease_expires_at is not null))
);

create index telegram_requests_claim_idx
on public.telegram_requests(link_id, status, received_at)
where status in ('queued', 'leased');

create index telegram_requests_retention_idx
on public.telegram_requests(status, received_at)
where raw_text is not null;

alter table public.telegram_pair_codes enable row level security;
alter table public.telegram_links enable row level security;
alter table public.telegram_requests enable row level security;

revoke all on table public.telegram_pair_codes from anon, authenticated;
revoke all on table public.telegram_links from anon, authenticated;
revoke all on table public.telegram_requests from anon, authenticated;
grant select, insert, update, delete on table public.telegram_pair_codes to service_role;
grant select, insert, update, delete on table public.telegram_links to service_role;
grant select, insert, update, delete on table public.telegram_requests to service_role;

-- New Supabase projects no longer guarantee automatic public-schema grants.
-- The Edge Functions use the server-only secret role for these existing tables.
grant select, insert, update, delete on table public.private_app_states to service_role;
grant select, insert, update, delete on table public.private_state_events to service_role;
grant select, insert, update, delete on table public.concierge_connections to service_role;
grant select, insert, update, delete on table public.concierge_proposal_runs to service_role;

create policy telegram_pair_codes_no_direct_access on public.telegram_pair_codes
for all to authenticated using (false) with check (false);
create policy telegram_links_no_direct_access on public.telegram_links
for all to authenticated using (false) with check (false);
create policy telegram_requests_no_direct_access on public.telegram_requests
for all to authenticated using (false) with check (false);

create or replace function public.consume_telegram_pair_code(
  requested_code_hash text,
  requested_telegram_user_id bigint,
  requested_telegram_chat_id bigint
)
returns table (link_id uuid, connection_id uuid, journey_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  pairing public.telegram_pair_codes%rowtype;
  existing_link record;
  created_link public.telegram_links%rowtype;
begin
  select item.* into pairing
  from public.telegram_pair_codes as item
  where item.code_hash = requested_code_hash
    and item.used_at is null
    and item.expires_at > now()
  for update;

  if not found then
    return;
  end if;

  if not exists (
    select 1 from public.concierge_connections as connection
    where connection.id = pairing.connection_id
      and connection.user_id = pairing.user_id
      and connection.journey_id = pairing.journey_id
      and connection.revoked_at is null
      and connection.expires_at > now()
  ) then
    return;
  end if;

  for existing_link in
    select item.id, item.connection_id
    from public.telegram_links as item
    where item.revoked_at is null
      and (item.connection_id = pairing.connection_id
        or item.telegram_user_id = requested_telegram_user_id
        or item.telegram_chat_id = requested_telegram_chat_id)
    for update
  loop
    update public.telegram_links set revoked_at = now() where id = existing_link.id;
    update public.telegram_requests as request
      set raw_text = null, status = 'expired', lease_id = null, lease_expires_at = null,
          processed_at = now(), updated_at = now()
      where request.link_id = existing_link.id and request.raw_text is not null;
    update public.concierge_connections
      set scopes = array_remove(array_remove(scopes, 'read_telegram_queue'), 'update_telegram_queue')
      where id = existing_link.connection_id;
  end loop;

  insert into public.telegram_links (
    user_id, journey_id, connection_id, telegram_user_id, telegram_chat_id
  ) values (
    pairing.user_id, pairing.journey_id, pairing.connection_id,
    requested_telegram_user_id, requested_telegram_chat_id
  ) returning * into created_link;

  update public.telegram_pair_codes set used_at = now() where id = pairing.id;
  update public.telegram_pair_codes
    set used_at = coalesce(used_at, now())
    where user_id = pairing.user_id and id <> pairing.id and used_at is null;
  update public.concierge_connections
    set scopes = array_append(array_append(
      array_remove(array_remove(scopes, 'read_telegram_queue'), 'update_telegram_queue'),
      'read_telegram_queue'), 'update_telegram_queue')
    where id = pairing.connection_id;

  return query select created_link.id, created_link.connection_id, created_link.journey_id;
end;
$$;

create or replace function public.enqueue_telegram_request(
  requested_telegram_user_id bigint,
  requested_telegram_chat_id bigint,
  requested_update_id bigint,
  requested_message_id bigint,
  requested_reply_to_message_id bigint,
  requested_raw_text text,
  requested_raw_hash text
)
returns table (outcome text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_link public.telegram_links%rowtype;
  parent_id uuid;
  created_id uuid;
begin
  if char_length(requested_raw_text) < 1 or char_length(requested_raw_text) > 4096 then
    return query select 'invalid_text'::text, null::uuid;
    return;
  end if;

  select link.* into active_link
  from public.telegram_links as link
  join public.concierge_connections as connection on connection.id = link.connection_id
  where link.telegram_user_id = requested_telegram_user_id
    and link.telegram_chat_id = requested_telegram_chat_id
    and link.revoked_at is null
    and connection.revoked_at is null
    and connection.expires_at > now()
    and connection.scopes @> array['read_telegram_queue', 'update_telegram_queue']::text[]
  for update of link;

  if not found then
    return query select 'not_linked'::text, null::uuid;
    return;
  end if;

  select item.id into created_id
  from public.telegram_requests as item
  where item.update_id = requested_update_id;
  if found then
    return query select 'duplicate'::text, created_id;
    return;
  end if;

  update public.telegram_requests
    set raw_text = null, status = 'expired', lease_id = null, lease_expires_at = null,
        processed_at = now(), updated_at = now()
    where raw_text is not null and received_at < now() - interval '14 days';

  if (select count(*) from public.telegram_requests as item
      where item.link_id = active_link.id
        and item.status in ('queued', 'leased', 'awaiting_clarification')) >= 50 then
    return query select 'queue_full'::text, null::uuid;
    return;
  end if;

  if requested_reply_to_message_id is not null then
    select item.id into parent_id
    from public.telegram_requests as item
    where item.link_id = active_link.id
      and item.status = 'awaiting_clarification'
      and item.bot_prompt_message_id = requested_reply_to_message_id
    order by item.received_at desc
    limit 1;
  end if;

  insert into public.telegram_requests (
    link_id, update_id, telegram_message_id, parent_request_id, raw_text, raw_hash
  ) values (
    active_link.id, requested_update_id, requested_message_id, parent_id,
    requested_raw_text, requested_raw_hash
  ) returning id into created_id;

  update public.telegram_links set last_received_at = now() where id = active_link.id;
  return query select 'queued'::text, created_id;
end;
$$;

create or replace function public.claim_telegram_requests(
  requested_connection_id uuid,
  requested_lease_id text,
  requested_limit integer default 20,
  requested_character_limit integer default 32000
)
returns table (request_id uuid, request_text text, received_at timestamptz, parent_request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.telegram_requests as item
    set status = 'queued', lease_id = null, lease_expires_at = null, updated_at = now()
    from public.telegram_links as link
    where item.link_id = link.id
      and link.connection_id = requested_connection_id
      and item.status = 'leased'
      and item.lease_expires_at <= now();

  return query
  with locked as materialized (
    select item.id, item.raw_text, item.received_at, item.parent_request_id
    from public.telegram_requests as item
    join public.telegram_links as link on link.id = item.link_id
    join public.concierge_connections as connection on connection.id = link.connection_id
    where link.connection_id = requested_connection_id
      and link.revoked_at is null
      and connection.revoked_at is null
      and connection.expires_at > now()
      and connection.scopes @> array['read_telegram_queue', 'update_telegram_queue']::text[]
      and item.status = 'queued'
      and item.raw_text is not null
    order by item.received_at, item.id
    limit least(greatest(requested_limit, 1), 20)
    for update of item skip locked
  ), candidates as (
    select locked.*,
      sum(char_length(locked.raw_text)) over (order by locked.received_at, locked.id) as cumulative_characters
    from locked
  ), selected as (
    select * from candidates
    where cumulative_characters <= least(greatest(requested_character_limit, 1), 32000)
  ), claimed as (
    update public.telegram_requests as item
      set status = 'leased', lease_id = requested_lease_id,
          lease_expires_at = now() + interval '2 hours', updated_at = now()
      from selected
      where item.id = selected.id
      returning item.id, item.raw_text, item.received_at, item.parent_request_id
  )
  select claimed.id, claimed.raw_text, claimed.received_at, claimed.parent_request_id
  from claimed order by claimed.received_at, claimed.id;
end;
$$;

create or replace function public.clarify_telegram_request(
  requested_connection_id uuid,
  requested_request_id uuid,
  requested_lease_id text,
  requested_bot_prompt_message_id bigint,
  requested_question text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.telegram_requests as item
    set status = 'awaiting_clarification', lease_id = null, lease_expires_at = null,
        bot_prompt_message_id = requested_bot_prompt_message_id,
        result_summary = left(requested_question, 500), updated_at = now()
    from public.telegram_links as link
    where item.id = requested_request_id
      and item.link_id = link.id
      and link.connection_id = requested_connection_id
      and link.revoked_at is null
      and item.status = 'leased'
      and item.lease_id = requested_lease_id;
  return found;
end;
$$;

create or replace function public.complete_telegram_requests(
  requested_connection_id uuid,
  requested_request_ids uuid[],
  requested_lease_id text,
  requested_run_key text,
  requested_outcome text,
  requested_summary text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if requested_outcome not in ('processed', 'no_change') then
    raise exception 'invalid_outcome';
  end if;

  with recursive selected as (
    select item.id, item.parent_request_id
    from public.telegram_requests as item
    join public.telegram_links as link on link.id = item.link_id
    where link.connection_id = requested_connection_id
      and item.id = any(requested_request_ids)
      and item.status = 'leased'
      and item.lease_id = requested_lease_id
    for update of item
  ), resolved(id) as (
    select id from selected
    union
    select item.parent_request_id
    from public.telegram_requests as item
    join resolved on resolved.id = item.id
    where item.parent_request_id is not null
  )
  update public.telegram_requests as item
    set raw_text = null, status = requested_outcome, lease_id = null, lease_expires_at = null,
        result_run_key = requested_run_key, result_summary = left(requested_summary, 500),
        processed_at = now(), updated_at = now()
    where item.id in (select id from resolved);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.fail_telegram_requests(
  requested_connection_id uuid,
  requested_request_ids uuid[],
  requested_lease_id text,
  requested_error text
)
returns table (request_id uuid, attempts integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.telegram_requests as item
    set attempts = least(item.attempts + 1, 3),
        status = case when item.attempts + 1 >= 3 then 'failed' else 'queued' end,
        lease_id = null, lease_expires_at = null,
        last_error = left(requested_error, 300), updated_at = now()
    from public.telegram_links as link
    where item.link_id = link.id
      and link.connection_id = requested_connection_id
      and item.id = any(requested_request_ids)
      and item.status = 'leased'
      and item.lease_id = requested_lease_id
    returning item.id, item.attempts, item.status;
end;
$$;

create or replace function public.revoke_telegram_connection(requested_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean := false;
begin
  update public.telegram_requests as item
    set raw_text = null, status = 'expired', lease_id = null, lease_expires_at = null,
        processed_at = now(), updated_at = now()
    from public.telegram_links as link
    where item.link_id = link.id and link.connection_id = requested_connection_id
      and item.raw_text is not null;
  update public.telegram_links set revoked_at = coalesce(revoked_at, now())
    where connection_id = requested_connection_id and revoked_at is null;
  changed := found;
  update public.concierge_connections
    set scopes = array_remove(array_remove(scopes, 'read_telegram_queue'), 'update_telegram_queue')
    where id = requested_connection_id;
  update public.telegram_pair_codes set used_at = coalesce(used_at, now())
    where connection_id = requested_connection_id and used_at is null;
  return changed;
end;
$$;

create or replace function public.cleanup_expired_telegram_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.telegram_requests
    set raw_text = null, status = 'expired', lease_id = null, lease_expires_at = null,
        processed_at = now(), updated_at = now()
    where raw_text is not null and received_at <= now() - interval '14 days';
  get diagnostics changed = row_count;
  delete from public.telegram_pair_codes
    where expires_at <= now() - interval '1 day'
       or used_at <= now() - interval '1 day';
  return changed;
end;
$$;

revoke all on function public.consume_telegram_pair_code(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.enqueue_telegram_request(bigint, bigint, bigint, bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function public.claim_telegram_requests(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.clarify_telegram_request(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.complete_telegram_requests(uuid, uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function public.fail_telegram_requests(uuid, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.revoke_telegram_connection(uuid) from public, anon, authenticated;
revoke all on function public.cleanup_expired_telegram_requests() from public, anon, authenticated;
grant execute on function public.consume_telegram_pair_code(text, bigint, bigint) to service_role;
grant execute on function public.enqueue_telegram_request(bigint, bigint, bigint, bigint, bigint, text, text) to service_role;
grant execute on function public.claim_telegram_requests(uuid, text, integer, integer) to service_role;
grant execute on function public.clarify_telegram_request(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.complete_telegram_requests(uuid, uuid[], text, text, text, text) to service_role;
grant execute on function public.fail_telegram_requests(uuid, uuid[], text, text) to service_role;
grant execute on function public.revoke_telegram_connection(uuid) to service_role;
grant execute on function public.cleanup_expired_telegram_requests() to service_role;

select cron.schedule(
  'telegram-concierge-retention',
  '17 18 * * *',
  'select public.cleanup_expired_telegram_requests();'
);
