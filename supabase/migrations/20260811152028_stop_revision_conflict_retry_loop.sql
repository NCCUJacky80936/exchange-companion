-- Revision mismatches are an application-level HTTP conflict, not a
-- serializable-transaction failure. SQLSTATE 40001 makes PostgREST clients and
-- infrastructure retry a request that can only succeed after the client pulls
-- the latest revision, creating an avoidable CPU loop on the free tier.
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
      raise sqlstate 'PT409' using message = 'revision_conflict';
    end if;
    insert into public.private_app_states (user_id, state, source_device, revision)
    values (current_user_id, next_state, null, 1)
    returning private_app_states.revision, private_app_states.updated_at
    into next_revision, next_updated_at;
  else
    if current_revision <> expected_revision then
      raise sqlstate 'PT409' using message = 'revision_conflict';
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
