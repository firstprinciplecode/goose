-- Fix session_participants RLS recursion
--
-- The original policy "Participants can view other participants in their sessions"
-- referenced public.session_participants inside its USING clause, which causes
-- Postgres to detect infinite recursion when evaluating RLS.
--
-- This replacement keeps behavior needed for invites/notifications:
-- - Users can read their own participant rows
-- - Session hosts can read all participant rows for sessions they host

begin;

alter table public.session_participants enable row level security;

drop policy if exists "Participants can view other participants in their sessions" on public.session_participants;
drop policy if exists "Participants can view their own participant record" on public.session_participants;
drop policy if exists "Host can view participants in their sessions" on public.session_participants;

create policy "Participants can view their own participant record"
  on public.session_participants
  for select
  using (user_id = auth.uid());

create policy "Host can view participants in their sessions"
  on public.session_participants
  for select
  using (
    exists (
      select 1
      from public.collaborative_sessions cs
      where cs.id = session_participants.session_id
        and cs.host_user_id = auth.uid()
    )
  );

commit;


