import type { SupabaseClient } from '@supabase/supabase-js';
import { TeamChannel, TeamMessage } from '../types/team';

export type TeamUserIdentity = {
  userId: string;
  email?: string;
  displayName?: string;
};

const randomToken = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const ensureProfile = async (client: SupabaseClient, identity: TeamUserIdentity) => {
  if (!identity.userId) return;
  await client
    .from('profiles')
    .upsert(
      {
        user_id: identity.userId,
        email: identity.email,
        display_name: identity.displayName,
      },
      { onConflict: 'user_id' }
    );
};

export const listChannels = async (client: SupabaseClient): Promise<TeamChannel[]> => {
  const { data, error } = await client.from('channels').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const listMessages = async (
  client: SupabaseClient,
  channelId: string,
  options?: { before?: string; limit?: number }
): Promise<TeamMessage[]> => {
  const limit = options?.limit ?? 30;
  const query = client
    .from('messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.before) {
    query.lt('created_at', options.before);
  }

  const { data, error } = await query;
  if (error) throw error;
  // We fetched descending; return ascending for UI
  return (data || []).slice().reverse();
};

export const createChannel = async (
  client: SupabaseClient,
  name: string,
  isPrivate: boolean,
  createdBy?: string,
  channelType: 'channel' | 'dm' = 'channel'
): Promise<TeamChannel> => {
  const { data, error } = await client
    .from('channels')
    .insert({ name, is_private: isPrivate, created_by: createdBy, channel_type: channelType })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const createDmChannel = async (
  client: SupabaseClient,
  targetUserId: string,
  currentUserId?: string
): Promise<TeamChannel> => {
  const name = `DM: ${[currentUserId, targetUserId].filter(Boolean).join(' & ')}` || 'Direct Message';
  return createChannel(client, name, true, currentUserId, 'dm');
};

export const sendMessage = async (
  client: SupabaseClient,
  channelId: string,
  content: string,
  userId: string,
  userEmail?: string
): Promise<TeamMessage> => {
  const { data, error } = await client
    .from('messages')
    .insert({ channel_id: channelId, content, user_id: userId, user_email: userEmail })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const subscribeToMessages = (
  client: SupabaseClient,
  channelId: string,
  onMessage: (msg: TeamMessage) => void
) => {
  console.log('[Team] Setting up realtime subscription for channel:', channelId);
  
  const channel = client.channel(`messages-${channelId}`);
  
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
    (payload) => {
      console.log('[Team] Received realtime message:', payload);
      const record = payload.new as TeamMessage;
      onMessage(record);
    }
  );

  channel.subscribe((status) => {
    console.log('[Team] Subscription status:', status);
    if (status === 'SUBSCRIBED') {
      console.log('[Team] ✓ Realtime subscription active for channel:', channelId);
    } else if (status === 'CHANNEL_ERROR') {
      console.error('[Team] ✗ Subscription error for channel:', channelId);
    } else if (status === 'TIMED_OUT') {
      console.error('[Team] ✗ Subscription timed out for channel:', channelId);
    }
  });

  return channel;
};

export const fetchProfilesByUserIds = async (
  client: SupabaseClient,
  userIds: string[]
): Promise<Record<string, { display_name?: string; email?: string }>> => {
  if (!userIds.length) return {};
  const { data, error } = await client
    .from('profiles')
    .select('user_id, display_name, email')
    .in('user_id', userIds);
  if (error) throw error;
  const map: Record<string, { display_name?: string; email?: string }> = {};
  (data || []).forEach((p) => {
    map[p.user_id] = { display_name: p.display_name, email: p.email };
  });
  return map;
};

export const createChannelInvite = async (
  client: SupabaseClient,
  channelId: string,
  createdBy: string,
  options?: { targetEmail?: string; expiresInDays?: number }
) => {
  const token = randomToken();
  const expiresAt =
    options?.expiresInDays && options.expiresInDays > 0
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data, error } = await client
    .from('channel_invites')
    .insert({
      channel_id: channelId,
      invite_token: token,
      target_email: options?.targetEmail || null,
      expires_at: expiresAt,
      created_by: createdBy,
      invited_by: createdBy, // Required NOT NULL field in existing schema
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Add creator as member when creating a channel (since trigger is disabled)
export const addChannelMember = async (
  client: SupabaseClient,
  channelId: string,
  memberId: string,
  role: 'owner' | 'member' = 'member'
) => {
  const { error } = await client
    .from('channel_members')
    .upsert({ channel_id: channelId, member_id: memberId, role }, { onConflict: 'channel_id,member_id' });
  if (error) throw error;
};

export const redeemInvite = async (client: SupabaseClient, token: string) => {
  const { data, error } = await client.rpc('redeem_invite', { p_token: token });
  if (error) throw error;
  return data;
};

