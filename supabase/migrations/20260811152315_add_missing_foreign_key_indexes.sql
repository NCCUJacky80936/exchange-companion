create index if not exists travel_members_added_by_idx
  on public.travel_members (added_by);

create index if not exists travel_plans_owner_id_idx
  on public.travel_plans (owner_id);

create index if not exists travel_share_links_created_by_idx
  on public.travel_share_links (created_by);
