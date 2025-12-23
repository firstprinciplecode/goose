/**
 * useCollaborativeAgentSession
 * 
 * React hook for managing collaborative agent sessions.
 * Handles session state, participants, messages, and real-time sync.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSupabase } from '../contexts/SupabaseContext';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  CollaborativeSession,
  SessionParticipant,
  SessionHumanMessage,
  createCollaborativeSession,
  getSessionByGooseId,
  getSessionById,
  setCollaborativeMode,
  endSession,
  getParticipants,
  leaveSession,
  sendMessage,
  getMessages,
  createInvite,
  redeemInvite,
  subscribeToMessages,
  subscribeToParticipants,
  subscribeToSession,
  containsGooseMention,
  stripGooseMention,
  getUserProfileById,
  parseEmailMentions,
  InviteOptions,
} from '../services/collaborativeSessionService';

// =============================================================================
// Types
// =============================================================================

export interface CollaborativeSessionState {
  /** The collaborative session data */
  session: CollaborativeSession | null;
  /** Current participants in the session */
  participants: SessionParticipant[];
  /** Human messages synced across participants */
  messages: SessionHumanMessage[];
  /** Whether a collaborative session is active */
  isCollaborative: boolean;
  /** Whether the current user is the host */
  isHost: boolean;
  /** Whether in collaborative mode (agent only responds to @goose) */
  collaborativeMode: boolean;
  /** Loading states */
  isLoading: boolean;
  isLoadingMessages: boolean;
  /** Error message if any */
  error: string | null;
  /** Cursor for message pagination */
  messagesCursor: string | null;
  /** Current user's ID for message attribution */
  currentUserId: string | null;
}

export interface CollaborativeSessionActions {
  /** Start a collaborative session for a Goose session */
  startSession: (gooseSessionId: string, title?: string) => Promise<void>;
  /** Join an existing collaborative session */
  joinSession: (sessionId: string) => Promise<void>;
  /** Join via invite token */
  joinWithToken: (token: string) => Promise<void>;
  /** Leave the current collaborative session */
  leave: () => Promise<void>;
  /** End the session (host only) */
  end: () => Promise<void>;
  /** Send a human message to the session. sessionIdOverride can be used when React state hasn't updated yet. */
  sendHumanMessage: (content: string, localMessageId?: string, sessionIdOverride?: string) => Promise<void>;
  /** Send an assistant response to the session (host-only via RLS) */
  sendAssistantMessage: (content: string, localMessageId?: string) => Promise<void>;
  /** Toggle collaborative mode */
  toggleCollaborativeMode: () => Promise<void>;
  /** Create an invite link */
  createInviteLink: (options?: InviteOptions) => Promise<string>;
  /** Load older messages */
  loadOlderMessages: () => Promise<void>;
  /** Parse @email mentions from text */
  parseEmailMentions: (content: string) => string[];
  /** Check if message contains @goose */
  shouldTriggerAgent: (content: string) => boolean;
  /** Strip @goose from message */
  stripAgentMention: (content: string) => string;
  /** Refresh session state */
  refresh: () => Promise<void>;
  /** Sync existing messages to the collaborative session (for backfilling on session creation) */
  syncExistingMessages: (sessionId: string, messages: Array<{ role: string; content: unknown; id?: string; created?: number }>) => Promise<void>;
}

export interface UseCollaborativeAgentSessionReturn {
  state: CollaborativeSessionState;
  actions: CollaborativeSessionActions;
}

// =============================================================================
// Helper to extract error messages
// =============================================================================

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  return String(e);
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useCollaborativeAgentSession(
  /** Optional: auto-connect to a Goose session */
  gooseSessionId?: string
): UseCollaborativeAgentSessionReturn {
  const { client, session: authSession, isEnabled } = useSupabase();

  // Debug: Log hook invocation
  console.log('🔵 useCollaborativeAgentSession CALLED:', { 
    gooseSessionId, 
    hasClient: !!client, 
    isEnabled, 
    hasUser: !!authSession?.user?.id 
  });

  // State
  const [collabSession, setCollabSession] = useState<CollaborativeSession | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [messages, setMessages] = useState<SessionHumanMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesCursor, setMessagesCursor] = useState<string | null>(null);

  // Refs for subscriptions
  const messageSubRef = useRef<RealtimeChannel | null>(null);
  const participantSubRef = useRef<RealtimeChannel | null>(null);
  const sessionSubRef = useRef<RealtimeChannel | null>(null);

  // Derived state
  const isCollaborative = !!collabSession?.is_active;
  const isHost = collabSession?.host_user_id === authSession?.user?.id;
  const collaborativeMode = collabSession?.collaborative_mode ?? false;

  // ==========================================================================
  // Cleanup subscriptions
  // ==========================================================================
  const cleanupSubscriptions = useCallback(() => {
    if (messageSubRef.current && client) {
      client.removeChannel(messageSubRef.current);
      messageSubRef.current = null;
    }
    if (participantSubRef.current && client) {
      client.removeChannel(participantSubRef.current);
      participantSubRef.current = null;
    }
    if (sessionSubRef.current && client) {
      client.removeChannel(sessionSubRef.current);
      sessionSubRef.current = null;
    }
  }, [client]);

  // ==========================================================================
  // Setup subscriptions for a session
  // ==========================================================================
  const setupSubscriptions = useCallback(
    (sessionId: string) => {
      if (!client) return;

      cleanupSubscriptions();

      // Subscribe to messages
      messageSubRef.current = subscribeToMessages(client, sessionId, (msg) => {
        setMessages((prev) => {
          // Deduplicate
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      });

      // Subscribe to participants - capture current user ID for comparison
      const currentUserId = authSession?.user?.id;
      
      participantSubRef.current = subscribeToParticipants(
        client,
        sessionId,
        async (participant) => {
          // On join - called when a new participant is inserted
          console.log('[CollabSession] 🎉 PARTICIPANT JOINED:', {
            userId: participant.user_id,
            displayName: participant.display_name,
            email: participant.email,
            sessionId: participant.session_id,
            currentUserId,
            isCurrentUser: participant.user_id === currentUserId,
          });
          
          // Fetch the user's profile to get their display name
          let displayName = participant.display_name;
          let email = participant.email;
          
          if (!displayName && !email) {
            try {
              const profile = await getUserProfileById(client, participant.user_id);
              if (profile) {
                displayName = profile.displayName;
                email = profile.email || undefined;
                console.log('[CollabSession] 📋 Fetched profile for participant:', displayName);
              }
            } catch (e) {
              console.warn('[CollabSession] ⚠️ Failed to fetch participant profile:', e);
            }
          }
          
          setParticipants((prev) => {
            const existing = prev.find((p) => p.user_id === participant.user_id);
            if (existing) {
              return prev.map((p) =>
                p.user_id === participant.user_id ? { ...p, ...participant, display_name: displayName, email, is_active: true } : p
              );
            }
            return [...prev, { ...participant, display_name: displayName, email }];
          });

          // Skip showing "You joined" message to the current user
          if (participant.user_id === currentUserId) {
            console.log('[CollabSession] 📢 Skipping join message for self');
            return;
          }

          // Add system message for join (only for OTHER users)
          const joinMessage: SessionHumanMessage = {
            id: `system-join-${participant.user_id}-${Date.now()}`,
            session_id: sessionId,
            user_id: participant.user_id,
            content: `${displayName || email || 'Someone'} joined the conversation`,
            message_type: 'system',
            created_at: new Date().toISOString(),
            user_display_name: displayName,
            user_email: email,
          };
          console.log('[CollabSession] 📢 Adding join system message:', joinMessage.content);
          setMessages((prev) => [...prev, joinMessage]);
        },
        async (participant) => {
          // On leave - called when participant is_active is set to false
          console.log('[CollabSession] 👋 PARTICIPANT LEFT:', {
            userId: participant.user_id,
            displayName: participant.display_name,
            email: participant.email,
          });
          
          // Fetch the user's profile to get their display name if not available
          let displayName = participant.display_name;
          let email = participant.email;
          
          if (!displayName && !email) {
            try {
              const profile = await getUserProfileById(client, participant.user_id);
              if (profile) {
                displayName = profile.displayName;
                email = profile.email || undefined;
              }
            } catch (e) {
              console.warn('[CollabSession] ⚠️ Failed to fetch participant profile:', e);
            }
          }
          
          setParticipants((prev) =>
            prev.map((p) =>
              p.user_id === participant.user_id ? { ...p, is_active: false } : p
            )
          );

          // Add system message for leave
          const leaveMessage: SessionHumanMessage = {
            id: `system-leave-${participant.user_id}-${Date.now()}`,
            session_id: sessionId,
            user_id: participant.user_id,
            content: `${displayName || email || 'Someone'} left the conversation`,
            message_type: 'system',
            created_at: new Date().toISOString(),
            user_display_name: displayName,
            user_email: email,
          };
          setMessages((prev) => [...prev, leaveMessage]);
        }
      );

      // Subscribe to session changes
      sessionSubRef.current = subscribeToSession(client, sessionId, (session) => {
        setCollabSession(session);
      });
    },
    [client, cleanupSubscriptions, authSession?.user?.id]
  );

  // ==========================================================================
  // Load session data
  // ==========================================================================
  const loadSessionData = useCallback(
    async (sessionId: string) => {
      if (!client) return;

      console.log('[CollabSession] loadSessionData called for:', sessionId);
      setIsLoading(true);
      setError(null);

      try {
        // Load session
        console.log('[CollabSession] Step 1: Loading session by ID...');
        const session = await getSessionById(client, sessionId);
        console.log('[CollabSession] Loaded session:', session?.id, session?.title);
        if (!session) {
          throw new Error('Session not found');
        }
        setCollabSession(session);

        // Load participants
        console.log('[CollabSession] Step 2: Loading participants...');
        let parts: any[] = [];
        try {
          parts = await getParticipants(client, sessionId);
          console.log('[CollabSession] Loaded participants:', parts.length);
        } catch (partErr: any) {
          console.error('[CollabSession] ⚠️ Failed to load participants:', partErr?.message || partErr);
          // Continue anyway - participants not critical
        }
        setParticipants(parts);

        // Load initial messages
        console.log('[CollabSession] Step 3: Loading messages...');
        setIsLoadingMessages(true);
        let msgs: any[] = [];
        try {
          msgs = await getMessages(client, sessionId);
          console.log('[CollabSession] 📨 Loaded messages:', msgs.length, msgs.map(m => ({ type: m.message_type, content: m.content?.slice(0, 50) })));
        } catch (msgErr: any) {
          console.error('[CollabSession] ⚠️ Failed to load messages:', msgErr?.message || msgErr);
          // Continue anyway
        }
        // Merge loaded messages with existing (avoid duplicates from subscription overlap)
        setMessages((prev) => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMsgs = msgs.filter(m => !existingIds.has(m.id));
          const merged = [...prev, ...newMsgs];
          // Sort by created_at
          merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          console.log('[CollabSession] Merged messages:', { prev: prev.length, new: newMsgs.length, total: merged.length });
          return merged;
        });
        if (msgs.length > 0) {
          setMessagesCursor(msgs[0].created_at);
        }
        setIsLoadingMessages(false);

        // Setup real-time subscriptions
        console.log('[CollabSession] Step 4: Setting up subscriptions...');
        setupSubscriptions(sessionId);
        console.log('[CollabSession] ✅ Session fully loaded');
      } catch (e: any) {
        console.error('[CollabSession] ❌ loadSessionData error:', e);
        console.error('[CollabSession] Error details:', {
          message: e?.message,
          code: e?.code,
          details: e?.details,
          hint: e?.hint,
        });
        setError(getErrorMessage(e));
      } finally {
        setIsLoading(false);
      }
    },
    [client, setupSubscriptions]
  );

  // ==========================================================================
  // Actions
  // ==========================================================================

  const startSession = useCallback(
    async (gooseId: string, title?: string) => {
      if (!client || !authSession?.user?.id) {
        setError('Not authenticated');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Check if session already exists
        let session = await getSessionByGooseId(client, gooseId);

        if (!session) {
          // Create new session
          session = await createCollaborativeSession(client, authSession.user.id, {
            gooseSessionId: gooseId,
            title,
            collaborativeMode: true,
          });
        }

        await loadSessionData(session.id);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setIsLoading(false);
      }
    },
    [client, authSession?.user?.id, loadSessionData]
  );

  const joinSession = useCallback(
    async (sessionId: string) => {
      if (!client || !authSession?.user?.id) {
        setError('Not authenticated');
        return;
      }

      await loadSessionData(sessionId);
    },
    [client, authSession?.user?.id, loadSessionData]
  );

  const joinWithToken = useCallback(
    async (token: string) => {
      if (!client) {
        setError('Supabase not configured');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const sessionId = await redeemInvite(client, token);
        await loadSessionData(sessionId);
      } catch (e) {
        setError(getErrorMessage(e));
      } finally {
        setIsLoading(false);
      }
    },
    [client, loadSessionData]
  );

  const leave = useCallback(async () => {
    if (!client || !collabSession || !authSession?.user?.id) return;

    try {
      await leaveSession(client, collabSession.id, authSession.user.id);
      cleanupSubscriptions();
      setCollabSession(null);
      setParticipants([]);
      setMessages([]);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [client, collabSession, authSession?.user?.id, cleanupSubscriptions]);

  const end = useCallback(async () => {
    if (!client || !collabSession || !isHost) return;

    try {
      await endSession(client, collabSession.id);
      cleanupSubscriptions();
      setCollabSession(null);
      setParticipants([]);
      setMessages([]);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [client, collabSession, isHost, cleanupSubscriptions]);

  const sendHumanMessage = useCallback(
    async (content: string, localMessageId?: string, sessionIdOverride?: string) => {
      // Allow passing session ID override for cases where React state hasn't updated yet
      const sessionId = sessionIdOverride || collabSession?.id;
      
      console.log('[CollabSession] sendHumanMessage called:', {
        hasClient: !!client,
        hasSession: !!collabSession,
        sessionId,
        sessionIdOverride,
        hasUser: !!authSession?.user?.id,
        contentPreview: content.slice(0, 50),
      });
      
      if (!client || !sessionId || !authSession?.user?.id) {
        console.warn('[CollabSession] sendHumanMessage skipped - missing:', {
          client: !!client,
          sessionId: !!sessionId,
          user: !!authSession?.user?.id,
        });
        return;
      }

      try {
        const isGooseTrigger = containsGooseMention(content);
        await sendMessage(client, sessionId, authSession.user.id, content, {
          messageType: isGooseTrigger ? 'goose_trigger' : 'user',
          localMessageId,
          userEmail: authSession.user.email,
        });
        console.log('[CollabSession] ✅ sendHumanMessage success:', content.slice(0, 50));
      } catch (e) {
        console.error('[CollabSession] ❌ sendHumanMessage failed:', e);
        setError(getErrorMessage(e));
      }
    },
    [client, collabSession, authSession?.user?.id, authSession?.user?.email]
  );

  const sendAssistantMessage = useCallback(
    async (content: string, localMessageId?: string) => {
      if (!client || !collabSession || !authSession?.user?.id) return;

      try {
        await sendMessage(client, collabSession.id, authSession.user.id, content, {
          messageType: 'assistant',
          localMessageId,
          userEmail: authSession.user.email,
        });
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [client, collabSession, authSession?.user?.id, authSession?.user?.email]
  );

  // Sync existing messages to a collaborative session (for backfilling on session creation)
  const syncExistingMessages = useCallback(
    async (sessionId: string, msgs: Array<{ role: string; content: unknown; id?: string; created?: number }>) => {
      if (!client || !authSession?.user?.id) {
        console.warn('[CollabSession] Cannot sync messages: not authenticated');
        return;
      }

      console.log('[CollabSession] 📤 Syncing', msgs.length, 'existing messages to session:', sessionId);

      // Get existing messages to check for duplicates
      const existingMessages = await getMessages(client, sessionId, { limit: 100 });
      const existingLocalIds = new Set(existingMessages.map(m => m.local_message_id).filter(Boolean));
      const existingContent = new Set(existingMessages.map(m => `${m.message_type}:${m.content.slice(0, 100)}`));
      
      console.log('[CollabSession] Found', existingMessages.length, 'existing messages, checking for duplicates');

      let synced = 0;
      let skipped = 0;
      
      for (const msg of msgs) {
        // Extract text content from the message
        let textContent = '';
        if (typeof msg.content === 'string') {
          textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
          textContent = msg.content
            .filter((part: { type: string }) => part.type === 'text')
            .map((part: { type: string; text?: string }) => part.text || '')
            .join('\n');
        }

        if (!textContent.trim()) continue;

        const messageType = msg.role === 'assistant' ? 'assistant' : 'user';
        
        // Skip if this local message ID already exists
        if (msg.id && existingLocalIds.has(msg.id)) {
          console.log('[CollabSession] ⏭️ Skipping (local_id exists):', messageType, textContent.slice(0, 30));
          skipped++;
          continue;
        }
        
        // Skip if content already exists (prevent duplicate Goose responses)
        const contentKey = `${messageType}:${textContent.slice(0, 100)}`;
        if (existingContent.has(contentKey)) {
          console.log('[CollabSession] ⏭️ Skipping (content exists):', messageType, textContent.slice(0, 30));
          skipped++;
          continue;
        }
        
        try {
          // Convert Unix timestamp to ISO string for database
          // msg.created could be in seconds or milliseconds
          let createdAt: string | undefined;
          if (msg.created) {
            // If timestamp is in seconds (< 10 billion), convert to milliseconds
            const ts = msg.created < 10000000000 ? msg.created * 1000 : msg.created;
            createdAt = new Date(ts).toISOString();
          }
          
          await sendMessage(client, sessionId, authSession.user.id, textContent, {
            messageType,
            localMessageId: msg.id,
            userEmail: authSession.user.email,
            createdAt,
          });
          console.log('[CollabSession] ✅ Synced message:', messageType, textContent.slice(0, 50), 'at', createdAt);
          synced++;
          // Add to existing sets to prevent duplicates within this sync batch
          if (msg.id) existingLocalIds.add(msg.id);
          existingContent.add(contentKey);
        } catch (e: any) {
          console.error('[CollabSession] Failed to sync message:', {
            error: e?.message,
            code: e?.code,
            details: e?.details,
            hint: e?.hint,
            messageType,
            textLength: textContent.length,
          });
        }
      }

      console.log('[CollabSession] ✅ Finished syncing:', { synced, skipped, total: msgs.length });
    },
    [client, authSession?.user?.id, authSession?.user?.email]
  );

  const toggleCollaborativeMode = useCallback(async () => {
    if (!client || !collabSession || !isHost) return;

    try {
      await setCollaborativeMode(client, collabSession.id, !collaborativeMode);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [client, collabSession, isHost, collaborativeMode]);

  const createInviteLink = useCallback(
    async (options?: InviteOptions): Promise<string> => {
      if (!client || !collabSession || !authSession?.user?.id) {
        throw new Error('Not authenticated or no active session');
      }

      const invite = await createInvite(client, collabSession.id, authSession.user.id, options);
      
      // Build the invite URL
      const baseUrl = window.location.origin + window.location.pathname;
      return `${baseUrl}#/pair?collab=${invite.invite_token}`;
    },
    [client, collabSession, authSession?.user?.id]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!client || !collabSession || !messagesCursor || isLoadingMessages) return;

    setIsLoadingMessages(true);
    try {
      const olderMsgs = await getMessages(client, collabSession.id, {
        before: messagesCursor,
        limit: 50,
      });

      if (olderMsgs.length > 0) {
        setMessages((prev) => [...olderMsgs, ...prev]);
        setMessagesCursor(olderMsgs[0].created_at);
      } else {
        setMessagesCursor(null); // No more messages
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoadingMessages(false);
    }
  }, [client, collabSession, messagesCursor, isLoadingMessages]);

  const refresh = useCallback(async () => {
    if (collabSession) {
      await loadSessionData(collabSession.id);
    }
  }, [collabSession, loadSessionData]);

  // ==========================================================================
  // Auto-connect to Goose session if provided
  // Poll periodically because ChatInput and BaseChat2 have separate hook instances
  // ==========================================================================
  useEffect(() => {
    console.log('🟡 POLL EFFECT:', { 
      gooseSessionId, 
      hasClient: !!client, 
      isEnabled, 
      hasUser: !!authSession?.user?.id,
      hasCollabSession: !!collabSession,
      collabSessionId: collabSession?.id,
    });

    if (!client || !isEnabled || !gooseSessionId || !authSession?.user?.id) {
      console.log('🔴 POLL SKIPPED - missing deps');
      return;
    }

    // If we already have a session, don't poll
    if (collabSession) {
      console.log('🟢 POLL SKIPPED - already have session:', collabSession.id);
      return;
    }

    let isMounted = true;
    let pollCount = 0;

    const checkForSession = async () => {
      pollCount++;
      console.log(`🔄 POLLING for session (${pollCount}):`, gooseSessionId);

      try {
        const existingSession = await getSessionByGooseId(client, gooseSessionId);
        console.log(`🔄 POLL result:`, existingSession?.id || 'null');
        
        if (existingSession && isMounted) {
          console.log('🟢 Found collaborative session, loading:', existingSession.id);
          await loadSessionData(existingSession.id);
        }
      } catch (e: any) {
        console.log('🔴 POLL error:', e?.message || e);
      }
    };

    // Initial check immediately
    void checkForSession();

    // Poll every 2 seconds to detect sessions created by other components
    const pollInterval = setInterval(checkForSession, 2000);

    return () => {
      console.log('🟠 POLL CLEANUP for:', gooseSessionId);
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [client, isEnabled, gooseSessionId, authSession?.user?.id, loadSessionData, collabSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupSubscriptions();
    };
  }, [cleanupSubscriptions]);

  // ==========================================================================
  // Return
  // ==========================================================================
  const state: CollaborativeSessionState = useMemo(
    () => ({
      session: collabSession,
      participants,
      messages,
      isCollaborative,
      isHost,
      collaborativeMode,
      isLoading,
      isLoadingMessages,
      error,
      messagesCursor,
      currentUserId: authSession?.user?.id || null,
    }),
    [
      collabSession,
      participants,
      messages,
      isCollaborative,
      isHost,
      collaborativeMode,
      isLoading,
      isLoadingMessages,
      error,
      messagesCursor,
      authSession?.user?.id,
    ]
  );

  const actions: CollaborativeSessionActions = useMemo(
    () => ({
      startSession,
      joinSession,
      joinWithToken,
      leave,
      end,
      sendHumanMessage,
      sendAssistantMessage,
      syncExistingMessages,
      toggleCollaborativeMode,
      createInviteLink,
      loadOlderMessages,
      parseEmailMentions,
      shouldTriggerAgent: containsGooseMention,
      stripAgentMention: stripGooseMention,
      refresh,
    }),
    [
      startSession,
      joinSession,
      joinWithToken,
      leave,
      end,
      sendHumanMessage,
      sendAssistantMessage,
      syncExistingMessages,
      toggleCollaborativeMode,
      createInviteLink,
      loadOlderMessages,
      refresh,
    ]
  );

  return { state, actions };
}

export default useCollaborativeAgentSession;

