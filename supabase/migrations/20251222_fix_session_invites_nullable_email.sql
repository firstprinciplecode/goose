-- =============================================================================
-- Fix: Allow NULL target_email and invite_token for direct user invites
-- 
-- For direct invites to connected users:
-- - target_email is not needed (we use target_user_id)
-- - invite_token is not needed (we use target_user_id for direct lookup)
-- =============================================================================

-- Drop the NOT NULL constraint on target_email if it exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' 
      and table_name = 'session_invites' 
      and column_name = 'target_email'
      and is_nullable = 'NO'
  ) then
    alter table public.session_invites alter column target_email drop not null;
    raise notice 'Dropped NOT NULL constraint from session_invites.target_email';
  end if;
end$$;

-- Drop the NOT NULL constraint on invite_token if it exists
-- Direct user invites don't need tokens - they use target_user_id
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' 
      and table_name = 'session_invites' 
      and column_name = 'invite_token'
      and is_nullable = 'NO'
  ) then
    alter table public.session_invites alter column invite_token drop not null;
    raise notice 'Dropped NOT NULL constraint from session_invites.invite_token';
  end if;
end$$;

-- Ensure the constraint exists that requires at least one target
-- (This is idempotent - it will be skipped if already exists)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'session_invite_has_target'
      and conrelid = 'public.session_invites'::regclass
  ) then
    alter table public.session_invites 
      add constraint session_invite_has_target 
      check (target_user_id is not null or target_email is not null);
    raise notice 'Added session_invite_has_target constraint';
  end if;
exception when others then
  -- Constraint might already exist, ignore
  null;
end$$;

