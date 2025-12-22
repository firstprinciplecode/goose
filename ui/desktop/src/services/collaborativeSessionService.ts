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
  message_type: 'user' | 'system' | 'goose_trigger';
  local_message_id?: string;
  created_at: string;
  user_email?: string;
  user_display_name?: string;
}

export interface SessionInvite {
  id: string;
  session_id: string;
  invited_by: string;
  target_email: string;
  invite_token: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expires_at?: string;
  created_at: string;
  redeemed_at?: string;
  redeemed_by?: string;
}

export interface CreateSessionOptions {
  gooseSessionId: string;
  title?: string;
  collaborativeMode?: boolean;
}

export interface InviteOptions {
  targetEmail?: string;
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
      profiles:user_id(display_name, email, avatar_url)
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
    avatar_url: p.profiles?.avatar_url,
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
    messageType?: 'user' | 'system' | 'goose_trigger';
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

  const { data, error } = await client
    .from('session_invites')
    .insert({
      session_id: sessionId,
      invited_by: invitedBy,
      target_email: options?.targetEmail || '',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
 * Get pending invites for a user by email
 */
export async function getPendingInvites(
  client: SupabaseClient,
  email: string
): Promise<SessionInvite[]> {
  const { data, error } = await client
    .from('session_invites')
    .select(`
      *,
      collaborative_sessions:session_id(title, goose_session_id)
    `)
    .eq('target_email', email.toLowerCase())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if (error) throw error;
  return data || [];
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

