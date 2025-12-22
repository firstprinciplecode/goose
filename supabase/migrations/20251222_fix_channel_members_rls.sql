-- Fix channel_members RLS to allow members to see other members of channels they belong to
-- This enables the "connected users" feature for @mentions

-- Drop the old restrictive policy
drop policy if exists channel_members_select on channel_members;

-- Create a new policy that allows members to see all members of channels they're in
create policy channel_members_select on channel_members
  for select using (
    auth.role() = 'service_role'
    -- You can see your own memberships
    or member_id = auth.uid()
    -- Channel creators can see all members
    or exists (
      select 1 from channels c where c.id = channel_id and c.created_by = auth.uid()
    )
    -- Members can see other members of channels they belong to
    or exists (
      select 1 from channel_members cm
      where cm.channel_id = channel_members.channel_id 
        and cm.member_id = auth.uid()
    )
  );

