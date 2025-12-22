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
  /** Send a human message to the session */
  sendHumanMessage: (content: string, localMessageId?: string) => Promise<void>;
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

      // Subscribe to participants
      participantSubRef.current = subscribeToParticipants(
        client,
        sessionId,
        (participant) => {
          // On join
          setParticipants((prev) => {
            const existing = prev.find((p) => p.user_id === participant.user_id);
            if (existing) {
              return prev.map((p) =>
                p.user_id === participant.user_id ? { ...p, ...participant, is_active: true } : p
              );
            }
            return [...prev, participant];
          });

          // Add system message for join
          const joinMessage: SessionHumanMessage = {
            id: `system-join-${participant.user_id}-${Date.now()}`,
            session_id: sessionId,
            user_id: participant.user_id,
            content: `${participant.display_name || participant.email || 'Someone'} joined the conversation`,
            message_type: 'system',
            created_at: new Date().toISOString(),
            user_display_name: participant.display_name,
            user_email: participant.email,
          };
          setMessages((prev) => [...prev, joinMessage]);
        },
        (participant) => {
          // On leave
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
            content: `${participant.display_name || participant.email || 'Someone'} left the conversation`,
            message_type: 'system',
            created_at: new Date().toISOString(),
            user_display_name: participant.display_name,
            user_email: participant.email,
          };
          setMessages((prev) => [...prev, leaveMessage]);
        }
      );

      // Subscribe to session changes
      sessionSubRef.current = subscribeToSession(client, sessionId, (session) => {
        setCollabSession(session);
      });
    },
    [client, cleanupSubscriptions]
  );

  // ==========================================================================
  // Load session data
  // ==========================================================================
  const loadSessionData = useCallback(
    async (sessionId: string) => {
      if (!client) return;

      setIsLoading(true);
      setError(null);

      try {
        // Load session
        const session = await getSessionById(client, sessionId);
        if (!session) {
          throw new Error('Session not found');
        }
        setCollabSession(session);

        // Load participants
        const parts = await getParticipants(client, sessionId);
        setParticipants(parts);

        // Load initial messages
        setIsLoadingMessages(true);
        const msgs = await getMessages(client, sessionId);
        setMessages(msgs);
        if (msgs.length > 0) {
          setMessagesCursor(msgs[0].created_at);
        }
        setIsLoadingMessages(false);

        // Setup real-time subscriptions
        setupSubscriptions(sessionId);
      } catch (e) {
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
    async (content: string, localMessageId?: string) => {
      if (!client || !collabSession || !authSession?.user?.id) return;

      try {
        const isGooseTrigger = containsGooseMention(content);
        await sendMessage(client, collabSession.id, authSession.user.id, content, {
          messageType: isGooseTrigger ? 'goose_trigger' : 'user',
          localMessageId,
          userEmail: authSession.user.email,
        });
      } catch (e) {
        setError(getErrorMessage(e));
      }
    },
    [client, collabSession, authSession?.user?.id, authSession?.user?.email]
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
  // ==========================================================================
  useEffect(() => {
    if (!client || !isEnabled || !gooseSessionId || !authSession?.user?.id) return;

    // Check if there's an existing collaborative session for this Goose session
    (async () => {
      try {
        const existingSession = await getSessionByGooseId(client, gooseSessionId);
        if (existingSession) {
          await loadSessionData(existingSession.id);
        }
      } catch (e) {
        console.error('[CollabSession] Error checking for existing session:', e);
      }
    })();
  }, [client, isEnabled, gooseSessionId, authSession?.user?.id, loadSessionData]);

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
      toggleCollaborativeMode,
      createInviteLink,
      loadOlderMessages,
      refresh,
    ]
  );

  return { state, actions };
}

export default useCollaborativeAgentSession;

