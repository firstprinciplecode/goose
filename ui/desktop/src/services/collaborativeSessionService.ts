/**
 * Collaborative Session Service
 * 
 * Handles CRUD operations and real-time subscriptions for collaborative agent sessions.
 * Uses Supabase as the backend for multi-user sync.
 */

import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface CollaborativeSession {
  id: string;
  goose_session_id: string;
  host_user_id: string;
  title?: string;
  is_active: boolean;
  collaborative_mode: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionParticipant {
  id: string;
  session_id: string;
  user_id: string;
  role: 'host' | 'collaborator' | 'spectator';
  joined_at: string;
  left_at?: string;
  is_active: boolean;
  // Joined from profiles
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

export interface SessionHumanMessage {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  message_type: 'user' | 'system' | 'goose_trigger' | 'assistant';
  local_message_id?: string;
  created_at: string;
  user_email?: string;
  user_display_name?: string;
}

export interface SessionInvite {
  id: string;
  session_id: string;
  invited_by: string;
  target_user_id?: string; // Direct invite to connected user
  target_email?: string; // Email invite
  invite_token?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expires_at?: string;
  created_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
  // Joined data for display
  inviter_display_name?: string;
  inviter_email?: string;
  session_title?: string;
  goose_session_id?: string;
}

export interface CreateSessionOptions {
  gooseSessionId: string;
  title?: string;
  collaborativeMode?: boolean;
}

export interface InviteOptions {
  targetUserId?: string; // Direct invite to connected user
  targetEmail?: string; // Email invite
  expiresInDays?: number;
}

// =============================================================================
// Session CRUD
// =============================================================================

/**
 * Create a new collaborative session linked to a Goose session
 */
export async function createCollaborativeSession(
  client: SupabaseClient,
  hostUserId: string,
  options: CreateSessionOptions
): Promise<CollaborativeSession> {
  const { data, error } = await client
    .from('collaborative_sessions')
    .insert({
      goose_session_id: options.gooseSessionId,
      host_user_id: hostUserId,
      title: options.title || `Session ${options.gooseSessionId.slice(0, 8)}`,
      collaborative_mode: options.collaborativeMode ?? true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get a collaborative session by its Goose session ID
 */
export async function getSessionByGooseId(
  client: SupabaseClient,
  gooseSessionId: string
): Promise<CollaborativeSession | null> {
  const { data, error } = await client
    .from('collaborative_sessions')
    .select('*')
    .eq('goose_session_id', gooseSessionId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
  return data;
}

/**
 * Get a collaborative session by its UUID
 */
export async function getSessionById(
  client: SupabaseClient,
  sessionId: string
): Promise<CollaborativeSession | null> {
  const { data, error } = await client
    .from('collaborative_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Update collaborative mode setting
 */
export async function setCollaborativeMode(
  client: SupabaseClient,
  sessionId: string,
  enabled: boolean
): Promise<void> {
  const { error } = await client
    .from('collaborative_sessions')
    .update({ collaborative_mode: enabled, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

/**
 * End a collaborative session
 */
export async function endSession(
  client: SupabaseClient,
  sessionId: string
): Promise<void> {
  const { error } = await client
    .from('collaborative_sessions')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

/**
 * List active collaborative sessions for a user
 */
export async function listUserSessions(
  client: SupabaseClient,
  userId: string
): Promise<CollaborativeSession[]> {
  const { data, error } = await client
    .from('collaborative_sessions')
    .select(`
      *,
      session_participants!inner(user_id)
    `)
    .eq('session_participants.user_id', userId)
    .eq('session_participants.is_active', true)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// =============================================================================
// Participants
// =============================================================================

/**
 * Get all active participants in a session
 */
export async function getParticipants(
  client: SupabaseClient,
  sessionId: string
): Promise<SessionParticipant[]> {
  const { data, error } = await client
    .from('session_participants')
    .select(`
      *,
      profiles:user_id(display_name, email)
    `)
    .eq('session_id', sessionId)
    .eq('is_active', true)
    .order('joined_at', { ascending: true });

  if (error) throw error;

  // Flatten the joined profile data
  return (data || []).map((p) => ({
    ...p,
    display_name: p.profiles?.display_name,
    email: p.profiles?.email,
  }));
}

/**
 * Check if a user is a participant in a session
 */
export async function isParticipant(
  client: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<boolean> {
  const { data, error } = await client
    .from('session_participants')
    .select('id')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return !!data;
}

/**
 * Leave a collaborative session
 */
export async function leaveSession(
  client: SupabaseClient,
  sessionId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from('session_participants')
    .update({ is_active: false, left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (error) throw error;
}

// =============================================================================
// Messages
// =============================================================================

/**
 * Send a human message to a collaborative session
 */
export async function sendMessage(
  client: SupabaseClient,
  sessionId: string,
  userId: string,
  content: string,
  options?: {
    messageType?: 'user' | 'system' | 'goose_trigger' | 'assistant';
    localMessageId?: string;
    userEmail?: string;
    userDisplayName?: string;
  }
): Promise<SessionHumanMessage> {
  const { data, error } = await client
    .from('session_human_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      content,
      message_type: options?.messageType || 'user',
      local_message_id: options?.localMessageId,
      user_email: options?.userEmail,
      user_display_name: options?.userDisplayName,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get messages for a session with pagination
 */
export async function getMessages(
  client: SupabaseClient,
  sessionId: string,
  options?: { before?: string; limit?: number }
): Promise<SessionHumanMessage[]> {
  const limit = options?.limit ?? 50;
  
  let query = client
    .from('session_human_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options?.before) {
    query = query.lt('created_at', options.before);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Return in chronological order
  return (data || []).reverse();
}

// =============================================================================
// Invites
// =============================================================================

/**
 * Create an invite to a collaborative session
 * Can be a direct invite (targetUserId) or email invite (targetEmail)
 */
export async function createInvite(
  client: SupabaseClient,
  sessionId: string,
  invitedBy: string,
  options?: InviteOptions
): Promise<SessionInvite> {
  const expiresAt = options?.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Build insert object based on invite type
  const insertData: Record<string, unknown> = {
    session_id: sessionId,
    invited_by: invitedBy,
    expires_at: expiresAt,
  };

  if (options?.targetUserId) {
    // Direct invite to connected user - no token needed
    insertData.target_user_id = options.targetUserId;
    insertData.invite_token = null; // Disable token for direct invites
  } else if (options?.targetEmail) {
    // Email/token invite
    insertData.target_email = options.targetEmail;
  } else {
    throw new Error('Either targetUserId or targetEmail must be specified');
  }

  const { data, error } = await client
    .from('session_invites')
    .insert(insertData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a direct invite to a connected user
 */
export async function inviteUser(
  client: SupabaseClient,
  sessionId: string,
  invitedBy: string,
  targetUserId: string
): Promise<SessionInvite> {
  return createInvite(client, sessionId, invitedBy, { targetUserId, expiresInDays: 1 });
}

/**
 * Accept a session invite by ID
 */
export async function acceptInvite(
  client: SupabaseClient,
  inviteId: string
): Promise<string> {
  const { data, error } = await client.rpc('accept_session_invite', { p_invite_id: inviteId });
  if (error) throw error;
  return data as string; // Returns session_id
}

/**
 * Decline a session invite
 */
export async function declineInvite(
  client: SupabaseClient,
  inviteId: string
): Promise<void> {
  const { error } = await client.rpc('decline_session_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

/**
 * Redeem a session invite token
 */
export async function redeemInvite(
  client: SupabaseClient,
  token: string
): Promise<string> {
  const { data, error } = await client.rpc('redeem_session_invite', { p_token: token });
  if (error) throw error;
  return data as string; // Returns session_id
}

/**
 * Get pending invites for the current user (by user ID or email)
 */
export async function getPendingInvites(
  client: SupabaseClient,
  userId: string,
  email?: string
): Promise<SessionInvite[]> {
  // Build the target filter - match by user ID or email
  const targetFilter = email 
    ? `target_user_id.eq.${userId},target_email.ilike.${email.toLowerCase()}`
    : `target_user_id.eq.${userId}`;

  // Build query with proper filter chain:
  // - status = pending
  // - (target_user_id = X OR target_email = Y)
  // - (expires_at IS NULL OR expires_at > now)
  const now = new Date().toISOString();
  
  let query = client
    .from('session_invites')
    .select(`
      *,
      collaborative_sessions:session_id(title, goose_session_id)
    `)
    .eq('status', 'pending')
    .or(targetFilter);
  
  // Add expiry filter - only include non-expired invites
  // Note: We can't chain .or() calls for different conditions in PostgREST
  // So we'll filter expires_at in JavaScript if needed, or use a single combined filter
  const { data: invites, error } = await query;

  if (error) throw error;
  if (!invites || invites.length === 0) return [];

  // Filter out expired invites in JavaScript
  const validInvites = invites.filter((invite) => {
    if (!invite.expires_at) return true; // No expiry = always valid
    return new Date(invite.expires_at) > new Date(now);
  });
  
  if (validInvites.length === 0) return [];

  // Fetch inviter profiles separately
  const inviterIds = [...new Set(validInvites.map((i) => i.invited_by))];
  const { data: profiles } = await client
    .from('profiles')
    .select('user_id, display_name, email')
    .in('user_id', inviterIds);

  const profileMap = new Map(
    (profiles || []).map((p) => [p.user_id, { display_name: p.display_name, email: p.email }])
  );

  // Flatten joined data
  return validInvites.map((invite) => {
    const inviterProfile = profileMap.get(invite.invited_by);
    return {
      ...invite,
      session_title: invite.collaborative_sessions?.title,
      goose_session_id: invite.collaborative_sessions?.goose_session_id,
      inviter_display_name: inviterProfile?.display_name,
      inviter_email: inviterProfile?.email,
    };
  });
}

// =============================================================================
// Real-time Subscriptions
// =============================================================================

/**
 * Subscribe to new messages in a session
 */
export function subscribeToMessages(
  client: SupabaseClient,
  sessionId: string,
  onMessage: (message: SessionHumanMessage) => void
): RealtimeChannel {
  const channel = client.channel(`collab-messages-${sessionId}`);

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'session_human_messages',
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => {
      onMessage(payload.new as SessionHumanMessage);
    }
  );

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[CollabSession] Subscribed to messages for session:', sessionId);
    } else if (err) {
      console.error('[CollabSession] Message subscription error:', err);
    }
  });

  return channel;
}

/**
 * Subscribe to participant changes in a session
 */
export function subscribeToParticipants(
  client: SupabaseClient,
  sessionId: string,
  onJoin: (participant: SessionParticipant) => void,
  onLeave: (participant: SessionParticipant) => void
): RealtimeChannel {
  const channel = client.channel(`collab-participants-${sessionId}`);

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'session_participants',
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => {
      onJoin(payload.new as SessionParticipant);
    }
  );

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'session_participants',
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => {
      const participant = payload.new as SessionParticipant;
      if (!participant.is_active) {
        onLeave(participant);
      }
    }
  );

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[CollabSession] Subscribed to participants for session:', sessionId);
    } else if (err) {
      console.error('[CollabSession] Participant subscription error:', err);
    }
  });

  return channel;
}

/**
 * Subscribe to session state changes
 */
export function subscribeToSession(
  client: SupabaseClient,
  sessionId: string,
  onChange: (session: CollaborativeSession) => void
): RealtimeChannel {
  const channel = client.channel(`collab-session-${sessionId}`);

  channel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'collaborative_sessions',
      filter: `id=eq.${sessionId}`,
    },
    (payload) => {
      onChange(payload.new as CollaborativeSession);
    }
  );

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[CollabSession] Subscribed to session state:', sessionId);
    } else if (err) {
      console.error('[CollabSession] Session subscription error:', err);
    }
  });

  return channel;
}

/**
 * Subscribe to incoming invites for the current user
 * This enables real-time notifications when someone invites you
 */
export function subscribeToIncomingInvites(
  client: SupabaseClient,
  userId: string,
  onInvite: (invite: SessionInvite) => void
): RealtimeChannel {
  const channel = client.channel(`collab-invites-${userId}`);

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'session_invites',
      filter: `target_user_id=eq.${userId}`,
    },
    async (payload) => {
      console.log('[CollabSession] Received invite:', payload);
      // Fetch invite with session data
      const { data } = await client
        .from('session_invites')
        .select(`
          *,
          collaborative_sessions:session_id(title, goose_session_id)
        `)
        .eq('id', payload.new.id)
        .single();

      if (data) {
        // Fetch inviter profile separately
        const { data: inviterProfile } = await client
          .from('profiles')
          .select('display_name, email')
          .eq('user_id', data.invited_by)
          .single();

        onInvite({
          ...data,
          session_title: data.collaborative_sessions?.title,
          goose_session_id: data.collaborative_sessions?.goose_session_id,
          inviter_display_name: inviterProfile?.display_name,
          inviter_email: inviterProfile?.email,
        } as SessionInvite);
      }
    }
  );

  channel.subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      console.log('[CollabSession] Subscribed to incoming invites for user:', userId);
    } else if (err) {
      console.error('[CollabSession] Invite subscription error:', err);
    }
  });

  return channel;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a message contains @goose mention
 */
export function containsGooseMention(content: string): boolean {
  // Match @goose with word boundary (case insensitive)
  return /@goose\b/i.test(content);
}

/**
 * Strip @goose mention from message content
 */
export function stripGooseMention(content: string): string {
  return content.replace(/@goose\b/gi, '').trim();
}

/**
 * Parse @email mentions from content
 * Returns array of email addresses found
 */
export function parseEmailMentions(content: string): string[] {
  // Match @email@domain.tld patterns
  const emailPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches = content.matchAll(emailPattern);
  return Array.from(matches, (m) => m[1]);
}

/**
 * Parse @username mentions from content (display names without spaces)
 * Returns array of usernames found
 */
export function parseUserMentions(content: string): string[] {
  // Match @username patterns (alphanumeric, dots, underscores, hyphens)
  // Exclude @goose and email patterns
  const mentionPattern = /@([a-zA-Z][a-zA-Z0-9._-]*)/g;
  const matches = content.matchAll(mentionPattern);
  return Array.from(matches, (m) => m[1]).filter(
    (name) => name.toLowerCase() !== 'goose' && !name.includes('@')
  );
}

// =============================================================================
// Connected Users (for direct invites)
// =============================================================================

export interface ConnectedUser {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * Get users that are connected to the current user
 * (share at least one channel or have had a DM)
 */
export async function getConnectedUsers(
  client: SupabaseClient,
  currentUserId: string
): Promise<ConnectedUser[]> {
  console.log('[getConnectedUsers] Fetching for user:', currentUserId);
  
  // Get all channel IDs the current user is a member of
  const { data: myChannels, error: channelError } = await client
    .from('channel_members')
    .select('channel_id')
    .eq('member_id', currentUserId);

  if (channelError) {
    console.error('[getConnectedUsers] Error fetching my channels:', channelError);
    throw channelError;
  }
  
  if (!myChannels || myChannels.length === 0) {
    console.log('[getConnectedUsers] No channels found for user');
    return [];
  }

  const channelIds = myChannels.map((c) => c.channel_id);
  console.log('[getConnectedUsers] Found channels:', channelIds.length);

  // Get all other members of those channels (just member_id, no join)
  const { data: members, error: memberError } = await client
    .from('channel_members')
    .select('member_id')
    .in('channel_id', channelIds)
    .neq('member_id', currentUserId);

  if (memberError) {
    console.error('[getConnectedUsers] Error fetching channel members:', memberError);
    throw memberError;
  }

  // Deduplicate member IDs
  const uniqueMemberIds = Array.from(new Set((members || []).map((m) => m.member_id)));
  console.log('[getConnectedUsers] Found unique members:', uniqueMemberIds.length);
  
  if (uniqueMemberIds.length === 0) {
    return [];
  }

  // Fetch profiles for those members separately (avatar_url may not exist in older schemas)
  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('user_id, display_name, email')
    .in('user_id', uniqueMemberIds);

  if (profileError) {
    console.error('[getConnectedUsers] Error fetching profiles:', profileError);
    throw profileError;
  }

  console.log('[getConnectedUsers] Fetched profiles:', profiles?.length || 0);

  // Build connected users list
  const userMap = new Map<string, ConnectedUser>();
  (profiles || []).forEach((p) => {
    if (!userMap.has(p.user_id)) {
      userMap.set(p.user_id, {
        userId: p.user_id,
        displayName: p.display_name || p.email || p.user_id.slice(0, 8),
        email: p.email,
      });
    }
  });

  // Also include members without profiles (use member_id as display)
  uniqueMemberIds.forEach((memberId) => {
    if (!userMap.has(memberId)) {
      userMap.set(memberId, {
        userId: memberId,
        displayName: memberId.slice(0, 8),
        email: undefined,
        avatarUrl: undefined,
      });
    }
  });

  const result = Array.from(userMap.values());
  console.log('[getConnectedUsers] Returning connected users:', result.length);
  return result;
}

/**
 * Find a user by their email address
 * Returns the user profile if found, null otherwise
 */
export async function getUserByEmail(
  client: SupabaseClient,
  email: string
): Promise<{ userId: string; displayName: string; email: string } | null> {
  console.log('[getUserByEmail] Looking up user:', email);
  
  const { data: profile, error } = await client
    .from('profiles')
    .select('user_id, display_name, email')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    console.error('[getUserByEmail] Error:', error);
    return null;
  }

  if (!profile) {
    console.log('[getUserByEmail] User not found:', email);
    return null;
  }

  console.log('[getUserByEmail] Found user:', profile.user_id);
  return {
    userId: profile.user_id,
    displayName: profile.display_name || profile.email || profile.user_id.slice(0, 8),
    email: profile.email || email,
  };
}

/**
 * Extract @mentions (email-style) from a message
 * Returns array of email addresses mentioned
 */
export function extractEmailMentions(message: string): string[] {
  // Match @email@domain.com patterns
  const emailMentionPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const matches: string[] = [];
  let match;
  
  while ((match = emailMentionPattern.exec(message)) !== null) {
    matches.push(match[1]);
  }
  
  console.log('[extractEmailMentions] Found mentions:', matches);
  return matches;
}

