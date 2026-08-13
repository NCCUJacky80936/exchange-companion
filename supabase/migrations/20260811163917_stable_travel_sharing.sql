-- One permanent link setting per travel plan. The row ID is the recoverable,
-- stable bearer token shown in the share URL; legacy random tokens for the
-- selected primary row continue to resolve during the transition.
alter table public.travel_share_links
  add column if not exists is_primary boolean not null default false;

with ranked as (
  select
    id,
    row_number() over (
      partition by plan_id
      order by (revoked_at is null) desc, created_at desc, id desc
    ) as position
  from public.travel_share_links
)
update public.travel_share_links links
set
  is_primary = ranked.position = 1,
  revoked_at = case
    when ranked.position = 1 then links.revoked_at
    else coalesce(links.revoked_at, now())
  end
from ranked
where links.id = ranked.id;

create unique index if not exists travel_share_links_one_primary_per_plan_idx
  on public.travel_share_links (plan_id)
  where is_primary;

create index if not exists travel_share_links_primary_lookup_idx
  on public.travel_share_links (plan_id, is_primary);

create or replace function private.redeem_travel_share(share_token text)
returns table (plan_id text, permission text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_link public.travel_share_links%rowtype;
  caller_id uuid := (select auth.uid());
  caller_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  caller_is_anonymous boolean := coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true);
  member_permission text;
  effective_permission text;
  link_available boolean;
begin
  if caller_id is null or length(share_token) < 32 then
    raise exception 'invalid_share';
  end if;

  select * into target_link
  from public.travel_share_links links
  where links.is_primary
    and (
      links.id::text = share_token
      or links.token_hash = extensions.digest(convert_to(share_token, 'utf8'), 'sha256')
    )
  limit 1;

  if target_link.id is null then
    raise exception 'invalid_share';
  end if;

  if not caller_is_anonymous and caller_email <> '' then
    select members.permission into member_permission
    from public.travel_members members
    where members.plan_id = target_link.plan_id
      and (
        members.user_id = caller_id
        or lower(members.invited_email) = caller_email
      )
    order by case members.permission when 'editor' then 2 else 1 end desc
    limit 1;
  end if;

  link_available := target_link.revoked_at is null
    and (target_link.expires_at is null or target_link.expires_at > now());

  if member_permission is null and not link_available then
    raise exception 'invalid_share';
  end if;

  effective_permission := case
    when member_permission = 'editor' or (link_available and target_link.permission = 'editor') then 'editor'
    else 'viewer'
  end;

  if link_available then
    insert into public.travel_link_grants (link_id, user_id)
    values (target_link.id, caller_id)
    on conflict (link_id, user_id) do update set granted_at = now();
  end if;

  return query select target_link.plan_id, effective_permission;
end;
$$;

revoke all on function private.redeem_travel_share(text) from public, anon;
grant execute on function private.redeem_travel_share(text) to authenticated;

-- Keep Data API privileges explicit for the 2026 exposure-default change.
grant select, insert, update, delete on public.travel_members to authenticated;
grant select, insert, update, delete on public.travel_share_links to authenticated;
