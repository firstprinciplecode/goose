-- =============================================================================
-- Enable Realtime for Collaborative Session Tables
-- =============================================================================
-- This migration adds the necessary tables to the Supabase Realtime publication
-- so that clients receive real-time updates for invites and messages.

-- Enable realtime for session_invites (for invite notifications)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and tablename = 'session_invites'
  ) then
    alter publication supabase_realtime add table public.session_invites;
    raise notice 'Added session_invites to supabase_realtime publication';
  else
    raise notice 'session_invites already in supabase_realtime publication';
  end if;
end
$$;

-- Enable realtime for session_human_messages (for message sync)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and tablename = 'session_human_messages'
  ) then
    alter publication supabase_realtime add table public.session_human_messages;
    raise notice 'Added session_human_messages to supabase_realtime publication';
  else
    raise notice 'session_human_messages already in supabase_realtime publication';
  end if;
end
$$;

-- Enable realtime for session_participants (for participant updates)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and tablename = 'session_participants'
  ) then
    alter publication supabase_realtime add table public.session_participants;
    raise notice 'Added session_participants to supabase_realtime publication';
  else
    raise notice 'session_participants already in supabase_realtime publication';
  end if;
end
$$;

-- Enable realtime for collaborative_sessions (for session updates)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
    and tablename = 'collaborative_sessions'
  ) then
    alter publication supabase_realtime add table public.collaborative_sessions;
    raise notice 'Added collaborative_sessions to supabase_realtime publication';
  else
    raise notice 'collaborative_sessions already in supabase_realtime publication';
  end if;
end
$$;

-- Ensure replica identity is set to FULL for better change detection
alter table public.session_invites replica identity full;
alter table public.session_human_messages replica identity full;
alter table public.session_participants replica identity full;
alter table public.collaborative_sessions replica identity full;

-- Show final state
do $$
declare
  rec record;
begin
  raise notice '=== Realtime Publication Tables ===';
  for rec in (
    select tablename from pg_publication_tables where pubname = 'supabase_realtime'
  ) loop
    raise notice 'Table: %', rec.tablename;
  end loop;
end
$$;

