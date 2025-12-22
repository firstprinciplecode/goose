-- =============================================================================
-- Fix: session_invites RLS policy for INSERT
-- The original policy only allowed participants to create invites, but:
-- 1. It was checking session_participants which could cause recursion
-- 2. The host creating their first invite may not be in session_participants yet
-- =============================================================================

-- Drop the problematic policy
drop policy if exists "Session participants can create invites" on public.session_invites;

-- Create a simpler policy that allows:
-- 1. The session host (via direct check on collaborative_sessions)
-- 2. Existing participants (but using a simpler check)
create policy "Session host or participants can create invites"
  on public.session_invites for insert
  with check (
    -- Check if user is the host of the session
    exists (
      select 1 from public.collaborative_sessions
      where id = session_invites.session_id
        and host_user_id = auth.uid()
    )
    or
    -- Or check if user is an active participant
    exists (
      select 1 from public.session_participants
      where session_id = session_invites.session_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

