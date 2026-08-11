drop policy if exists private_states_select_own on public.private_app_states;
drop policy if exists private_states_insert_own on public.private_app_states;
drop policy if exists private_states_update_own on public.private_app_states;
drop policy if exists private_states_delete_own on public.private_app_states;

create policy private_states_select_own on public.private_app_states
for select to authenticated
using (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy private_states_insert_own on public.private_app_states
for insert to authenticated
with check (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy private_states_update_own on public.private_app_states
for update to authenticated
using (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true')
with check (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy private_states_delete_own on public.private_app_states
for delete to authenticated
using (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');

drop policy if exists private_state_events_select_own on public.private_state_events;
drop policy if exists private_state_events_insert_own on public.private_state_events;
create policy private_state_events_select_own on public.private_state_events
for select to authenticated
using (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');
create policy private_state_events_insert_own on public.private_state_events
for insert to authenticated
with check (user_id = (select auth.uid()) and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') <> 'true');

drop policy if exists concierge_connections_no_direct_access on public.concierge_connections;
drop policy if exists concierge_proposal_runs_no_direct_access on public.concierge_proposal_runs;
