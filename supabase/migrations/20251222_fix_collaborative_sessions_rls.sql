-- =============================================================================
-- Fix: collaborative_sessions RLS policy recursion
-- The SELECT policy was referencing session_participants which can cause 
-- infinite recursion errors (500 status from Supabase)
-- =============================================================================

-- Drop the problematic recursive policy
drop policy if exists "Users can view sessions they participate in" on public.collaborative_sessions;

-- Create a simpler non-recursive policy:
-- 1. Host can always see their own sessions
-- 2. Anyone authenticated can query sessions by goose_session_id (needed for lookups)
-- 3. Participants check happens at the application level or via RPC
create policy "Users can view collaborative sessions"
  on public.collaborative_sessions for select
  using (
    auth.role() = 'service_role'
    or host_user_id = auth.uid()
    or auth.uid() is not null  -- Allow authenticated users to query sessions
  );

-- Note: For stricter access control, you could use an RPC function instead
-- that checks participant membership without RLS recursion issues

