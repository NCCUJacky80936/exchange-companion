create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.private_app_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  source_device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.travel_plans (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.travel_members (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.travel_plans(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  permission text not null check (permission in ('viewer', 'editor')),
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id is not null or nullif(trim(invited_email), '') is not null)
);

create unique index travel_members_plan_user_idx
  on public.travel_members(plan_id, user_id)
  where user_id is not null;
create unique index travel_members_plan_email_idx
  on public.travel_members(plan_id, lower(invited_email))
  where invited_email is not null;
create index travel_members_user_id_idx on public.travel_members(user_id);
create index travel_members_plan_id_idx on public.travel_members(plan_id);
create index travel_members_invited_email_idx on public.travel_members(lower(invited_email));

create table public.travel_share_links (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null references public.travel_plans(id) on delete cascade,
  token_hash bytea not null unique,
  permission text not null check (permission in ('viewer', 'editor')),
  access_mode text not null check (access_mode in ('anyone', 'approved_google')),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index travel_share_links_plan_id_idx on public.travel_share_links(plan_id);
create index travel_share_links_active_idx
  on public.travel_share_links(plan_id, expires_at)
  where revoked_at is null;

create table public.travel_link_grants (
  link_id uuid not null references public.travel_share_links(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (link_id, user_id)
);

create index travel_link_grants_user_id_idx on public.travel_link_grants(user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger private_app_states_set_updated_at
before update on public.private_app_states
for each row execute function private.set_updated_at();

create trigger travel_plans_set_updated_at
before update on public.travel_plans
for each row execute function private.set_updated_at();

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

create or replace function private.travel_permission(target_plan_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select
      (select auth.uid()) as user_id,
      lower(coalesce((select auth.jwt()) ->> 'email', '')) as email,
      coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true) as is_anonymous
  ), permissions as (
    select 'owner'::text as permission, 3 as weight
    from public.travel_plans p, caller c
    where p.id = target_plan_id and p.owner_id = c.user_id

    union all

    select m.permission, case m.permission when 'editor' then 2 else 1 end
    from public.travel_members m, caller c
    where m.plan_id = target_plan_id
      and (
        m.user_id = c.user_id
        or (
          m.user_id is null
          and not c.is_anonymous
          and c.email <> ''
          and lower(m.invited_email) = c.email
        )
      )

    union all

    select l.permission, case l.permission when 'editor' then 2 else 1 end
    from public.travel_link_grants g
    join public.travel_share_links l on l.id = g.link_id
    join caller c on c.user_id = g.user_id
    where l.plan_id = target_plan_id
      and l.revoked_at is null
      and (l.expires_at is null or l.expires_at > now())
  )
  select coalesce((select permission from permissions order by weight desc limit 1), 'none');
$$;

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
begin
  if caller_id is null or length(share_token) < 32 then
    raise exception 'invalid_share';
  end if;

  select * into target_link
  from public.travel_share_links l
  where l.token_hash = extensions.digest(convert_to(share_token, 'utf8'), 'sha256')
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
  limit 1;

  if target_link.id is null then
    raise exception 'invalid_share';
  end if;

  if target_link.access_mode = 'approved_google' and not (
    not caller_is_anonymous
    and caller_email <> ''
    and exists (
      select 1 from public.travel_members m
      where m.plan_id = target_link.plan_id
        and (
          m.user_id = caller_id
          or lower(m.invited_email) = caller_email
        )
    )
  ) then
    raise exception 'account_approval_required';
  end if;

  insert into public.travel_link_grants (link_id, user_id)
  values (target_link.id, caller_id)
  on conflict (link_id, user_id) do update set granted_at = now();

  return query select target_link.plan_id, target_link.permission;
end;
$$;

create or replace function public.redeem_travel_share(share_token text)
returns table (plan_id text, permission text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.redeem_travel_share(share_token);
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function private.travel_permission(text) from public, anon;
grant execute on function private.travel_permission(text) to authenticated;
revoke all on function private.redeem_travel_share(text) from public, anon;
grant execute on function private.redeem_travel_share(text) to authenticated;
revoke all on function public.redeem_travel_share(text) from public, anon;
grant execute on function public.redeem_travel_share(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.private_app_states enable row level security;
alter table public.travel_plans enable row level security;
alter table public.travel_members enable row level security;
alter table public.travel_share_links enable row level security;
alter table public.travel_link_grants enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated
using (user_id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
for insert to authenticated
with check (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy private_states_select_own on public.private_app_states
for select to authenticated
using (user_id = (select auth.uid()));
create policy private_states_insert_own on public.private_app_states
for insert to authenticated
with check (user_id = (select auth.uid()));
create policy private_states_update_own on public.private_app_states
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy private_states_delete_own on public.private_app_states
for delete to authenticated
using (user_id = (select auth.uid()));

create policy travel_plans_select_allowed on public.travel_plans
for select to authenticated
using ((select private.travel_permission(id)) in ('owner', 'editor', 'viewer'));
create policy travel_plans_insert_own on public.travel_plans
for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy travel_plans_update_allowed on public.travel_plans
for update to authenticated
using ((select private.travel_permission(id)) in ('owner', 'editor'))
with check ((select private.travel_permission(id)) in ('owner', 'editor'));
create policy travel_plans_delete_own on public.travel_plans
for delete to authenticated
using (owner_id = (select auth.uid()));

create policy travel_members_select_owner_or_self on public.travel_members
for select to authenticated
using (
  added_by = (select auth.uid())
  or user_id = (select auth.uid())
  or (
    not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, true)
    and lower(invited_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  )
);
create policy travel_members_insert_owner on public.travel_members
for insert to authenticated
with check (
  added_by = (select auth.uid())
  and exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
);
create policy travel_members_update_owner on public.travel_members
for update to authenticated
using (
  exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
)
with check (
  added_by = (select auth.uid())
  and exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
);
create policy travel_members_delete_owner on public.travel_members
for delete to authenticated
using (
  exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
);

create policy travel_share_links_owner_all on public.travel_share_links
for all to authenticated
using (
  exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
)
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.travel_plans p
    where p.id = plan_id and p.owner_id = (select auth.uid())
  )
);

create policy travel_link_grants_select_own on public.travel_link_grants
for select to authenticated
using (user_id = (select auth.uid()));
create policy travel_link_grants_delete_own on public.travel_link_grants
for delete to authenticated
using (user_id = (select auth.uid()));

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.private_app_states to authenticated;
grant select, insert, update, delete on public.travel_plans to authenticated;
grant select, insert, update, delete on public.travel_members to authenticated;
grant select, insert, update, delete on public.travel_share_links to authenticated;
grant select, delete on public.travel_link_grants to authenticated;

alter publication supabase_realtime add table public.travel_plans;
