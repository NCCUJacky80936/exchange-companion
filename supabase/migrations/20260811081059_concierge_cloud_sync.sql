alter table public.private_app_states
add column revision bigint not null default 1 check (revision > 0);

create table public.private_state_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_id text not null,
  revision bigint not null check (revision > 0),
  base_revision bigint not null check (base_revision >= 0),
  actor text not null check (actor in ('manual', 'proposal', 'system')),
  changed_paths text[] not null default array['state']::text[],
  created_at timestamptz not null default now(),
  unique (user_id, revision)
);

create index private_state_events_user_revision_idx
on public.private_state_events(user_id, revision desc);

create table public.concierge_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journey_id text not null,
  label text not null default 'Codex Exchange Concierge',
  token_hash text not null unique,
  scopes text[] not null default array['read_state', 'submit_proposals']::text[],
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index concierge_connections_user_idx
on public.concierge_connections(user_id, created_at desc);

create table public.concierge_proposal_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.concierge_connections(id) on delete set null,
  journey_id text not null,
  journey_scope text not null,
  base_revision bigint not null check (base_revision > 0),
  run_key text not null,
  bundle jsonb not null check (jsonb_typeof(bundle) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'delivered', 'conflict', 'rejected')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (user_id, run_key)
);

create index concierge_proposal_runs_pending_idx
on public.concierge_proposal_runs(user_id, status, created_at);

alter table public.private_state_events enable row level security;
alter table public.concierge_connections enable row level security;
alter table public.concierge_proposal_runs enable row level security;

create policy private_state_events_select_own on public.private_state_events
for select to authenticated
using (user_id = (select auth.uid()));

create policy private_state_events_insert_own on public.private_state_events
for insert to authenticated
with check (user_id = (select auth.uid()));

grant select, insert on public.private_state_events to authenticated;
revoke all on public.concierge_connections from anon, authenticated;
revoke all on public.concierge_proposal_runs from anon, authenticated;

create or replace function public.save_private_app_state(
  next_state jsonb,
  expected_revision bigint,
  changed_paths text[] default array['state']::text[],
  change_actor text default 'manual'
)
returns table (revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_revision bigint;
  next_revision bigint;
  next_updated_at timestamptz;
  journey_id_value text;
begin
  if current_user_id is null or coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) then
    raise exception 'permanent_account_required';
  end if;
  if jsonb_typeof(next_state) <> 'object' then
    raise exception 'invalid_state';
  end if;
  if change_actor not in ('manual', 'proposal', 'system') then
    raise exception 'invalid_actor';
  end if;

  journey_id_value := next_state #>> '{journey,id}';
  if nullif(trim(journey_id_value), '') is null then
    raise exception 'journey_id_required';
  end if;

  select item.revision
    into current_revision
    from public.private_app_states as item
    where item.user_id = current_user_id
    for update;

  if not found then
    if expected_revision <> 0 then
      raise sqlstate '40001' using message = 'revision_conflict';
    end if;
    insert into public.private_app_states (user_id, state, source_device, revision)
    values (current_user_id, next_state, null, 1)
    returning private_app_states.revision, private_app_states.updated_at
    into next_revision, next_updated_at;
  else
    if current_revision <> expected_revision then
      raise sqlstate '40001' using message = 'revision_conflict';
    end if;
    update public.private_app_states as item
      set state = next_state,
          revision = item.revision + 1
      where item.user_id = current_user_id
      returning item.revision, item.updated_at
      into next_revision, next_updated_at;
  end if;

  insert into public.private_state_events (user_id, journey_id, revision, base_revision, actor, changed_paths)
  values (
    current_user_id,
    journey_id_value,
    next_revision,
    expected_revision,
    change_actor,
    case when coalesce(array_length(changed_paths, 1), 0) = 0 then array['state']::text[] else changed_paths end
  );

  return query select next_revision, next_updated_at;
end;
$$;

revoke all on function public.save_private_app_state(jsonb, bigint, text[], text) from public, anon;
grant execute on function public.save_private_app_state(jsonb, bigint, text[], text) to authenticated;
