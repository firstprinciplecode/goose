-- Collaborative Agent Sessions
-- Enables multi-user collaboration within Goose agent chat sessions

-- =============================================================================
-- TABLE: collaborative_sessions
-- Links a Goose session to a collaborative session for multi-user sync
-- =============================================================================
create table if not exists public.collaborative_sessions (
  id uuid primary key default gen_random_uuid(),
  goose_session_id text not null,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  is_active boolean default true,
  collaborative_mode boolean default true, -- When true, agent only responds to @goose
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for fast lookup by goose session ID
create index if not exists idx_collaborative_sessions_goose_id 
  on public.collaborative_sessions(goose_session_id);

-- Index for finding active sessions by host
create index if not exists idx_collaborative_sessions_host 
  on public.collaborative_sessions(host_user_id, is_active);

-- =============================================================================
-- TABLE: session_participants
-- Tracks who is participating in a collaborative session
-- =============================================================================
create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.collaborative_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('host', 'collaborator', 'spectator')),
  joined_at timestamptz default now(),
  left_at timestamptz,
  is_active boolean default true,
  
  unique(session_id, user_id)
);

-- Index for finding participants in a session
create index if not exists idx_session_participants_session 
  on public.session_participants(session_id, is_active);

-- Index for finding sessions a user is in
create index if not exists idx_session_participants_user 
  on public.session_participants(user_id, is_active);

-- =============================================================================
-- TABLE: session_human_messages
-- Synced human messages for collaborative sessions (not agent responses)
-- Agent responses are handled by the local Goose session
-- =============================================================================
create table if not exists public.session_human_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.collaborative_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  message_type text not null default 'user' check (message_type in ('user', 'system', 'goose_trigger')),
  -- goose_trigger means the message contained @goose and was sent to the agent
  local_message_id text, -- Optional: links to the local Goose message ID
  created_at timestamptz default now(),
  
  -- Denormalized fields for display
  user_email text,
  user_display_name text
);

-- Index for fetching messages in a session (ordered by time)
create index if not exists idx_session_human_messages_session 
  on public.session_human_messages(session_id, created_at desc);

-- =============================================================================
-- TABLE: session_invites
-- Pending invitations to collaborative sessions
-- =============================================================================
create table if not exists public.session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.collaborative_sessions(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  target_email text not null,
  invite_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now(),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id)
);

-- Index for looking up invites by token
create index if not exists idx_session_invites_token 
  on public.session_invites(invite_token);

-- Index for finding pending invites for a user by email
create index if not exists idx_session_invites_email 
  on public.session_invites(target_email, status);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to get the current user's email from JWT
create or replace function public.jwt_user_email() returns text as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::json->>'email', ''),
    (select email from auth.users where id = auth.uid())
  );
$$ language sql stable;

-- Trigger function to auto-populate user email/name on message insert
create or replace function public.set_message_user_info()
returns trigger as $$
begin
  if new.user_email is null then
    new.user_email := jwt_user_email();
  end if;
  if new.user_display_name is null then
    select display_name into new.user_display_name 
    from public.profiles 
    where user_id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for auto-populating message user info
drop trigger if exists set_message_user_info_trigger on public.session_human_messages;
create trigger set_message_user_info_trigger
  before insert on public.session_human_messages
  for each row execute function set_message_user_info();

-- Function to add host as participant when session is created
create or replace function public.add_session_host()
returns trigger as $$
begin
  insert into public.session_participants (session_id, user_id, role, is_active)
  values (new.id, new.host_user_id, 'host', true)
  on conflict (session_id, user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- Create trigger for auto-adding host as participant
drop trigger if exists add_session_host_trigger on public.collaborative_sessions;
create trigger add_session_host_trigger
  after insert on public.collaborative_sessions
  for each row execute function add_session_host();

-- Function to redeem a session invite
create or replace function public.redeem_session_invite(p_token text)
returns uuid as $$
declare
  v_invite record;
  v_session_id uuid;
begin
  -- Find and validate the invite
  select * into v_invite
  from public.session_invites
  where invite_token = p_token
    and status = 'pending'
    and (expires_at is null or expires_at > now());

  if v_invite is null then
    raise exception 'Invalid or expired invite token';
  end if;

  -- Check if target email matches (if specified)
  if v_invite.target_email is not null and v_invite.target_email != '' then
    if lower(v_invite.target_email) != lower(jwt_user_email()) then
      raise exception 'This invite is for a different email address';
    end if;
  end if;

  -- Add user as participant
  insert into public.session_participants (session_id, user_id, role, is_active)
  values (v_invite.session_id, auth.uid(), 'collaborator', true)
  on conflict (session_id, user_id) 
  do update set is_active = true, left_at = null, joined_at = now();

  -- Mark invite as accepted
  update public.session_invites
  set status = 'accepted',
      redeemed_at = now(),
      redeemed_by = auth.uid()
  where id = v_invite.id;

  return v_invite.session_id;
end;
$$ language plpgsql security definer;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.collaborative_sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_human_messages enable row level security;
alter table public.session_invites enable row level security;

-- collaborative_sessions policies
create policy "Users can view sessions they participate in"
  on public.collaborative_sessions for select
  using (
    host_user_id = auth.uid() or
    exists (
      select 1 from public.session_participants
      where session_id = collaborative_sessions.id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "Authenticated users can create sessions"
  on public.collaborative_sessions for insert
  with check (auth.uid() = host_user_id);

create policy "Host can update their sessions"
  on public.collaborative_sessions for update
  using (host_user_id = auth.uid());

create policy "Host can delete their sessions"
  on public.collaborative_sessions for delete
  using (host_user_id = auth.uid());

-- session_participants policies
create policy "Participants can view other participants in their sessions"
  on public.session_participants for select
  using (
    exists (
      select 1 from public.session_participants sp
      where sp.session_id = session_participants.session_id
        and sp.user_id = auth.uid()
        and sp.is_active = true
    )
  );

create policy "Host can manage participants"
  on public.session_participants for insert
  with check (
    exists (
      select 1 from public.collaborative_sessions
      where id = session_participants.session_id
        and host_user_id = auth.uid()
    ) or user_id = auth.uid() -- Users can add themselves via invite redemption
  );

create policy "Participants can leave (update their own record)"
  on public.session_participants for update
  using (user_id = auth.uid());

-- session_human_messages policies
create policy "Participants can view messages in their sessions"
  on public.session_human_messages for select
  using (
    exists (
      select 1 from public.session_participants
      where session_id = session_human_messages.session_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "Participants can send messages to their sessions"
  on public.session_human_messages for insert
  with check (
    user_id = auth.uid() and
    exists (
      select 1 from public.session_participants
      where session_id = session_human_messages.session_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

-- session_invites policies
create policy "Users can view invites they created or are targeted to them"
  on public.session_invites for select
  using (
    invited_by = auth.uid() or
    lower(target_email) = lower(jwt_user_email())
  );

create policy "Session participants can create invites"
  on public.session_invites for insert
  with check (
    exists (
      select 1 from public.session_participants
      where session_id = session_invites.session_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "Invite creator can update their invites"
  on public.session_invites for update
  using (invited_by = auth.uid() or lower(target_email) = lower(jwt_user_email()));

-- =============================================================================
-- REALTIME
-- Enable realtime for collaborative features
-- =============================================================================

-- Enable realtime for messages (critical for live collaboration)
alter table public.session_human_messages replica identity full;

-- Enable realtime for participants (for join/leave notifications)
alter table public.session_participants replica identity full;

-- Enable realtime for session state changes
alter table public.collaborative_sessions replica identity full;

