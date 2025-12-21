-- Team auth + invite-gated access
-- Tables

-- Compatibility: if old tables exist with user_id instead of member_id, rename
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'member_id'
  ) then
    execute 'alter table public.channel_members rename column user_id to member_id';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'user_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'member_id'
  ) then
    execute 'alter table public.channel_reads rename column user_id to member_id';
  end if;

  -- If channel_invites exists with column token instead of invite_token, rename
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'token'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'invite_token'
  ) then
    execute 'alter table public.channel_invites rename column token to invite_token';
  end if;
end$$;

-- Drop existing policies that might block column type changes
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','channels','channel_members','channel_invites','messages','channel_reads')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end$$;

-- Compatibility: coerce legacy text IDs to uuid where needed
do $$
begin
  -- helper to change column type only if current is text
  perform 1;

  -- Drop NOT NULL before cleaning invalid UUIDs
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'created_by'
  ) then
    execute 'alter table public.channels alter column created_by drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'channel_id'
  ) then
    execute 'alter table public.channel_invites alter column channel_id drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'created_by'
  ) then
    execute 'alter table public.channel_invites alter column created_by drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'redeemed_by'
  ) then
    execute 'alter table public.channel_invites alter column redeemed_by drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'channel_id'
  ) then
    execute 'alter table public.messages alter column channel_id drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_id'
  ) then
    execute 'alter table public.messages alter column user_id drop not null';
  end if;

  -- Clean non-UUID values by setting them to null before casting
  -- Clean and cast primary key columns that might still be text/varchar
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'id' and data_type in ('text','character varying')
  ) then
    delete from public.channels
    where id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    execute 'alter table public.channels alter column id type uuid using id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'id' and data_type in ('text','character varying')
  ) then
    delete from public.channel_members
    where id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    execute 'alter table public.channel_members alter column id type uuid using id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'id' and data_type in ('text','character varying')
  ) then
    delete from public.channel_invites
    where id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    execute 'alter table public.channel_invites alter column id type uuid using id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'id' and data_type in ('text','character varying')
  ) then
    delete from public.messages
    where id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    execute 'alter table public.messages alter column id type uuid using id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_id' and data_type in ('text','character varying')
  ) then
    delete from public.profiles
    where user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
    execute 'alter table public.profiles alter column user_id type uuid using user_id::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'created_by' and data_type in ('text','character varying')
  ) then
    update public.channels
    set created_by = null
    where created_by::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    update public.channel_members
    set channel_id = null
    where channel_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'member_id' and data_type in ('text','character varying')
  ) then
    update public.channel_members
    set member_id = null
    where member_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    update public.channel_reads
    set channel_id = null
    where channel_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'member_id' and data_type in ('text','character varying')
  ) then
    update public.channel_reads
    set member_id = null
    where member_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    update public.channel_invites
    set channel_id = null
    where channel_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'created_by' and data_type in ('text','character varying')
  ) then
    update public.channel_invites
    set created_by = null
    where created_by::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'redeemed_by' and data_type in ('text','character varying')
  ) then
    update public.channel_invites
    set redeemed_by = null
    where redeemed_by::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    update public.messages
    set channel_id = null
    where channel_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_id' and data_type in ('text','character varying')
  ) then
    update public.messages
    set user_id = null
    where user_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'created_by' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channels alter column created_by type uuid using created_by::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_members alter column channel_id type uuid using channel_id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_members' and column_name = 'member_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_members alter column member_id type uuid using member_id::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_reads alter column channel_id type uuid using channel_id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_reads' and column_name = 'member_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_reads alter column member_id type uuid using member_id::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_invites alter column channel_id type uuid using channel_id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'created_by' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_invites alter column created_by type uuid using created_by::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'redeemed_by' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.channel_invites alter column redeemed_by type uuid using redeemed_by::uuid';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'channel_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.messages alter column channel_id type uuid using channel_id::uuid';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_id' and data_type in ('text','character varying')
  ) then
    execute 'alter table public.messages alter column user_id type uuid using user_id::uuid';
  end if;
end$$;
create table if not exists profiles (
  user_id uuid primary key,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel_type text not null default 'channel', -- 'channel' | 'dm'
  is_private boolean not null default false,
  created_by uuid not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  member_id uuid not null,
  role text not null default 'member', -- member|owner
  created_at timestamptz default now(),
  unique(channel_id, member_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null,
  user_email text,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists channel_invites (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  invite_token text not null unique,
  target_email text,
  created_by uuid not null,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid,
  created_at timestamptz default now()
);

create table if not exists channel_reads (
  channel_id uuid not null references channels(id) on delete cascade,
  member_id uuid not null,
  last_read_at timestamptz default now(),
  primary key(channel_id, member_id)
);

-- Add missing columns to existing tables (if table existed but columns were missing)
do $$
begin
  -- channels.created_by
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'created_by'
  ) then
    execute 'alter table public.channels add column created_by uuid';
  end if;
  -- channels.channel_type
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'channel_type'
  ) then
    execute $x$alter table public.channels add column channel_type text not null default 'channel'$x$;
  end if;
  -- channel_invites.created_by
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'created_by'
  ) then
    execute 'alter table public.channel_invites add column created_by uuid';
  end if;
  -- channel_invites.redeemed_by
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'redeemed_by'
  ) then
    execute 'alter table public.channel_invites add column redeemed_by uuid';
  end if;
  -- channel_invites.redeemed_at
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'redeemed_at'
  ) then
    execute 'alter table public.channel_invites add column redeemed_at timestamptz';
  end if;
  -- channel_invites.target_email
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'target_email'
  ) then
    execute 'alter table public.channel_invites add column target_email text';
  end if;
  -- channel_invites.expires_at
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channel_invites' and column_name = 'expires_at'
  ) then
    execute 'alter table public.channel_invites add column expires_at timestamptz';
  end if;
  -- messages.user_email
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'messages' and column_name = 'user_email'
  ) then
    execute 'alter table public.messages add column user_email text';
  end if;
end$$;

-- Indexes
create index if not exists idx_messages_channel_created_at on messages(channel_id, created_at desc);
create index if not exists idx_channel_members_channel_member on channel_members(channel_id, member_id);
create index if not exists idx_channel_invites_token on channel_invites(invite_token);
create index if not exists idx_channel_reads_channel_member on channel_reads(channel_id, member_id);

-- Helpers
create or replace function public.jwt_email() returns text as $$
  select coalesce(current_setting('request.jwt.claim.email', true), '')::text;
$$ language sql stable;

create or replace function public.set_message_email() returns trigger as $$
begin
  if new.user_email is null or length(new.user_email) = 0 then
    new.user_email := public.jwt_email();
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_set_message_email on messages;
create trigger trg_set_message_email
before insert on messages
for each row execute function public.set_message_email();

create or replace function public.add_creator_membership() returns trigger as $$
begin
  if new.created_by is not null then
    insert into channel_members(channel_id, member_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_add_creator_membership on channels;
create trigger trg_add_creator_membership
after insert on channels
for each row execute function public.add_creator_membership();

-- Invite redemption
create or replace function public.redeem_invite(p_token text) returns channel_invites as $$
declare
  inv channel_invites;
  current_email text := lower(public.jwt_email());
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into inv
  from channel_invites
  where invite_token = p_token
    and (expires_at is null or expires_at > now())
    and redeemed_at is null
  limit 1;

  if not found then
    raise exception 'Invalid or expired invite';
  end if;

  if inv.target_email is not null and length(inv.target_email) > 0 then
    if lower(inv.target_email) <> current_email then
      raise exception 'Invite not valid for this email';
    end if;
  end if;

  insert into channel_members(channel_id, member_id, role)
  values (inv.channel_id, uid, 'member')
  on conflict do nothing;

  update channel_invites
  set redeemed_at = now(), redeemed_by = uid
  where id = inv.id;

  return inv;
end;
$$ language plpgsql security definer;

-- RLS
alter table profiles enable row level security;
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;
alter table channel_invites enable row level security;
alter table channel_reads enable row level security;

-- Profiles
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (auth.role() = 'service_role' or auth.uid() is not null);

drop policy if exists profiles_upsert on profiles;
create policy profiles_upsert on profiles
  for all using (auth.role() = 'service_role' or auth.uid() = user_id)
  with check (auth.role() = 'service_role' or auth.uid() = user_id);

-- Channels
drop policy if exists channels_select on channels;
create policy channels_select on channels
  for select using (
    auth.role() = 'service_role'
    or not is_private
    or created_by = auth.uid()
    or exists (
      select 1 from channel_members m
      where m.channel_id = id and m.member_id = auth.uid()
    )
  );

drop policy if exists channels_insert on channels;
create policy channels_insert on channels
  for insert with check (auth.role() = 'service_role' or auth.uid() = created_by);

drop policy if exists channels_update on channels;
create policy channels_update on channels
  for update using (auth.role() = 'service_role' or created_by = auth.uid());

drop policy if exists channels_delete on channels;
create policy channels_delete on channels
  for delete using (auth.role() = 'service_role' or created_by = auth.uid());

-- Channel members
drop policy if exists channel_members_select on channel_members;
create policy channel_members_select on channel_members
  for select using (
    auth.role() = 'service_role'
    or member_id = auth.uid()
    or exists (
      select 1 from channels c where c.id = channel_id and c.created_by = auth.uid()
    )
  );

drop policy if exists channel_members_insert on channel_members;
create policy channel_members_insert on channel_members
  for insert with check (
    auth.role() = 'service_role'
    or member_id = auth.uid()
    or exists (select 1 from channels c where c.id = channel_id and c.created_by = auth.uid())
  );

drop policy if exists channel_members_delete on channel_members;
create policy channel_members_delete on channel_members
  for delete using (
    auth.role() = 'service_role'
    or member_id = auth.uid()
    or exists (select 1 from channels c where c.id = channel_id and c.created_by = auth.uid())
  );

-- Messages
drop policy if exists messages_select on messages;
create policy messages_select on messages
  for select using (
    auth.role() = 'service_role'
    or exists (
      select 1 from channel_members m
      where m.channel_id = channel_id and m.member_id = auth.uid()
    )
  );

drop policy if exists messages_insert on messages;
create policy messages_insert on messages
  for insert with check (
    auth.role() = 'service_role'
    or (
      user_id = auth.uid()
      and exists (
        select 1 from channel_members m
        where m.channel_id = channel_id and m.member_id = auth.uid()
      )
    )
  );

-- Channel invites
drop policy if exists channel_invites_select on channel_invites;
create policy channel_invites_select on channel_invites
  for select using (
    auth.role() = 'service_role'
    or created_by = auth.uid()
    or (
      target_email is not null
      and length(target_email) > 0
      and lower(target_email) = lower(public.jwt_email())
    )
  );

drop policy if exists channel_invites_insert on channel_invites;
create policy channel_invites_insert on channel_invites
  for insert with check (auth.role() = 'service_role' or created_by = auth.uid());

drop policy if exists channel_invites_update on channel_invites;
create policy channel_invites_update on channel_invites
  for update using (auth.role() = 'service_role' or created_by = auth.uid());

-- Channel reads
drop policy if exists channel_reads_select on channel_reads;
create policy channel_reads_select on channel_reads
  for select using (
    auth.role() = 'service_role'
    or exists (
      select 1 from channel_members m
      where m.channel_id = channel_id and m.member_id = auth.uid()
    )
  );

drop policy if exists channel_reads_upsert on channel_reads;
create policy channel_reads_upsert on channel_reads
  for all using (
    auth.role() = 'service_role'
    or exists (
      select 1 from channel_members m
      where m.channel_id = channel_id and m.member_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1 from channel_members m
      where m.channel_id = channel_id and m.member_id = auth.uid()
    )
  );

-- Defaults: disallow anon
revoke all on all tables in schema public from anon;

