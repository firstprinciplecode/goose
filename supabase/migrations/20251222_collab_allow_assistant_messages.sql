-- Allow collaborative sessions to sync assistant responses via Supabase.
-- We extend session_human_messages to also store assistant messages.
--
-- NOTE: The original migration explicitly excluded agent responses. For cross-machine
-- collaboration, we need a shared transport for agent output as well.

begin;

-- Expand allowed message_type values (idempotent)ue

do $$
begin
  -- Drop and recreate constraint to include 'assistant'
  if exists (
    select 1
    from pg_constraint
    where conname = 'session_human_messages_message_type_check'
      and conrelid = 'public.session_human_messages'::regclass 
  ) then
    alter table public.session_human_messages
      drop constraint session_human_messages_message_type_check;
  end if;

  alter table public.session_human_messages
    add constraint session_human_messages_message_type_check
    check (message_type in ('user', 'system', 'goose_trigger', 'assistant'));
exception
  when duplicate_object then
    -- constraint already present
    null;
end$$;

-- Tighten insert policy so only the host can write assistant messages
drop policy if exists "Participants can send messages to their sessions" on public.session_human_messages;

create policy "Participants can send messages to their sessions"
  on public.session_human_messages for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.session_participants
      where session_id = session_human_messages.session_id
        and user_id = auth.uid()
        and is_active = true
    )
    and (
      -- regular human messages
      message_type in ('user', 'system', 'goose_trigger')
      -- assistant messages only allowed from host
      or (
        message_type = 'assistant'
        and exists (
          select 1 from public.collaborative_sessions cs
          where cs.id = session_human_messages.session_id
            and cs.host_user_id = auth.uid()
        )
      )
    )
  );

commit;


