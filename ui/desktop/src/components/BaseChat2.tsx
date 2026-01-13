import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { SearchView } from './conversation/SearchView';
import LoadingGoose from './LoadingGoose';
import PopularChatTopics from './PopularChatTopics';
import ProgressiveMessageList from './ProgressiveMessageList';
import ChatInput from './ChatInput';
import { ScrollArea, ScrollAreaHandle } from './ui/scroll-area';
import { useFileDrop } from '../hooks/useFileDrop';
import { Message } from '../types/message';
import { ChatState } from '../types/chatState';
import { ChatType } from '../types/chat';
import { useIsMobile } from '../hooks/use-mobile';
import { cn } from '../utils';
import { useChatStream } from '../hooks/useChatStream';
import { useNavigation } from '../hooks/useNavigation';
import { useCollaborativeAgentSession } from '../hooks/useCollaborativeAgentSession';
import { SessionHumanMessage } from '../services/collaborativeSessionService';
import { RecipeHeader } from './RecipeHeader';
import { RecipeWarningModal } from './ui/RecipeWarningModal';
import { scanRecipe } from '../recipe';
import { useCostTracking } from '../hooks/useCostTracking';
import RecipeActivities from './recipes/RecipeActivities';
import { useToolCount } from './alerts/useToolCount';
import { getThinkingMessage } from '../types/message';
import ParameterInputModal from './ParameterInputModal';
import ParticipantsBar from './ParticipantsBar';
import PendingInvitesInHistory from './PendingInvitesInHistory';
import { useComments } from '../hooks/useComments';
import { useTabContext } from '../contexts/TabContext';
import { client as apiClient } from '../api/client.gen';

interface BaseChatProps {
  setChat?: (chat: ChatType) => void; // Made optional for inactive tabs
  setIsGoosehintsModalOpen?: (isOpen: boolean) => void;
  onMessageSubmit?: (message: string) => void;
  renderHeader?: () => React.ReactNode;
  customChatInputProps?: Record<string, unknown>;
  suppressEmptyState: boolean;
  sessionId: string;
  initialMessage?: string;
  onSessionIdChange?: (newSessionId: string) => void;
  // Matrix integration props
  showParticipantsBar?: boolean;
  matrixRoomId?: string;
  showPendingInvites?: boolean;
  // Sidecar and UI props
  contentClassName?: string;
  disableSearch?: boolean;
  showPopularTopics?: boolean;
  loadingChat?: boolean;
  // Tab-specific sidecar props
  tabId?: string;
  // Tab persistence prop
  isTabActive?: boolean; // Whether this tab is currently active/visible
  // Collaborative session prop - true when joining (not hosting) a collaborative session
  isCollaborativeJoin?: boolean;
}

function BaseChatContent({
  setChat,
  setIsGoosehintsModalOpen,
  renderHeader,
  customChatInputProps = {},
  sessionId,
  initialMessage,
  onSessionIdChange,
  showParticipantsBar = false,
  matrixRoomId,
  showPendingInvites = false,
  contentClassName: customContentClassName,
  disableSearch = false,
  showPopularTopics = true,
  loadingChat = false,
  tabId,
  isCollaborativeJoin = false,
}: BaseChatProps) {
  const location = useLocation();
  const scrollRef = useRef<ScrollAreaHandle>(null);

  const disableAnimation = location.state?.disableAnimation || false;
  const [hasStartedUsingRecipe, setHasStartedUsingRecipe] = React.useState(false);
  const [hasNotAcceptedRecipe, setHasNotAcceptedRecipe] = useState<boolean>();
  const [hasRecipeSecurityWarnings, setHasRecipeSecurityWarnings] = useState(false);

  const isMobile = useIsMobile();
  const setView = useNavigation();

  // Use custom content class name if provided, otherwise default
  const contentClassName = customContentClassName || cn('pr-1 pb-10', isMobile && 'pt-11');

  // Comment state management
  const commentState = useComments(sessionId);

  // Use shared file drop
  const { droppedFiles, setDroppedFiles, handleDrop, handleDragOver } = useFileDrop();

  const onStreamFinish = useCallback(() => {}, []);

  // Collaborative session integration
  const collab = useCollaborativeAgentSession(sessionId);

  // If another human is present in the collaborative session, force mention-only behavior
  // for *everyone* (host + guests). When the guest leaves, this becomes false and Goose
  // returns to normal auto-response.
  const gooseMentionOnly = useMemo(() => {
    // If we know we're joining a collab session (e.g. invite accept fallback created a fresh local tab),
    // start in mention-only to avoid a brief "Goose ON" window before participants hydrate.
    if (isCollaborativeJoin) return true;
    if (!collab.state.isCollaborative) return false;
    // Prefer the server-synced collaborative mode flag (set by host when guests are present).
    // This avoids participant hydration races on guests that can briefly re-enable Goose.
    if (collab.state.collaborativeMode) return true;
    // Fallback: if participants indicate another active user, stay in mention-only.
    const activeOthers = collab.state.participants.filter(
      (p) => p.is_active && p.user_id !== collab.state.currentUserId
    );
    return activeOthers.length > 0;
  }, [
    isCollaborativeJoin,
    collab.state.isCollaborative,
    collab.state.collaborativeMode,
    collab.state.participants,
    collab.state.currentUserId,
  ]);

  // For the host agent: provide full collaborative context to useChatStream so @goose answers
  // have the correct shared conversation history. Keep this conversion simple and stable:
  // it's only used as prompt context, not for display.
  const agentContextMessages = useMemo(() => {
    if (!collab.state.isCollaborative) return undefined;
    const converted: Message[] = collab.state.messages.map((m) => ({
      id: m.id,
      role: m.message_type === 'assistant' ? 'assistant' : 'user',
      created: Math.floor(new Date(m.created_at).getTime() / 1000),
      content: [{ type: 'text', text: m.content }],
    }));
    converted.sort((a, b) => {
      const aTime = typeof a.created === 'number' ? a.created : 0;
      const bTime = typeof b.created === 'number' ? b.created : 0;
      return aTime - bTime;
    });
    return converted;
  }, [collab.state.isCollaborative, collab.state.messages]);

  const {
    session,
    messages,
    chatState,
    handleSubmit: streamHandleSubmit,
    stopStreaming,
    sessionLoadError,
    setRecipeUserParams,
    tokenState,
    gooseEnabled,
  } = useChatStream({
    sessionId,
    onStreamFinish,
    initialMessage,
    onSessionIdChange,
    isMatrixTab: !!matrixRoomId, // Pass Matrix tab flag based on whether we have a matrixRoomId
    tabId, // Pass tabId for sidecar filtering
    matrixRoomId, // Pass Matrix room ID for loading historical messages
    isCollaborativeJoin, // Joining a collaborative session - disable Goose auto-response
    gooseMentionOnly,
    agentContextMessages,
  });
  
  // Get tab context for accessing tab title
  const tabContext = useTabContext();

  // Ensure this chat view joins the exact collaborative session id as soon as it's created/joined
  // elsewhere in the UI (e.g., `ChatInput`). This prevents "message inserted but not rendered"
  // issues caused by timing gaps in goose_session_id polling.
  useEffect(() => {
    const storageKey = `pending-collab-join:${sessionId}`;

    const onJoined = (evt: Event) => {
      const e = evt as CustomEvent;
      const detail = e.detail as { gooseSessionId?: string; collabSessionId?: string } | undefined;
      if (!detail?.gooseSessionId || !detail?.collabSessionId) return;
      if (detail.gooseSessionId !== sessionId) return;
      if (collab.state.session?.id === detail.collabSessionId) return;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      // Join idempotently; hook will handle subscription setup and state hydration.
      void collab.actions.joinSession(detail.collabSessionId);
    };

    window.addEventListener('collab-session-joined', onJoined as EventListener);

    // Also handle the case where the join event fired before this tab mounted (race).
    try {
      const pending = sessionStorage.getItem(storageKey);
      if (pending && (!collab.state.session?.id || collab.state.session.id !== pending)) {
        void collab.actions.joinSession(pending);
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      // ignore
    }

    return () => window.removeEventListener('collab-session-joined', onJoined as EventListener);
  }, [sessionId, collab.actions, collab.state.session?.id]);

  // Guest leave handling:
  // Closing the tab/app should mark the guest inactive so the host can un-mute Goose.
  // We only do this for non-host participants.
  const guestLeaveSnapshotRef = useRef<{
    isCollaborative: boolean;
    isHost: boolean;
    collabSessionId: string | null;
  }>({ isCollaborative: false, isHost: false, collabSessionId: null });
  const guestLeaveDidRunRef = useRef(false);
  const guestLeaveMountedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    guestLeaveSnapshotRef.current = {
      isCollaborative: collab.state.isCollaborative,
      isHost: collab.state.isHost,
      collabSessionId: collab.state.session?.id ? String(collab.state.session.id) : null,
    };
  }, [collab.state.isCollaborative, collab.state.isHost, collab.state.session?.id]);

  useEffect(() => {
    guestLeaveDidRunRef.current = false;
    guestLeaveMountedAtRef.current = Date.now();

    return () => {
      // IMPORTANT:
      // React runs effect cleanup on dependency changes, not just "real unmount".
      // We keep dependencies stable and use refs for latest state, so this only runs
      // on actual unmount (or sessionId change).
      const snap = guestLeaveSnapshotRef.current;
      if (!snap.isCollaborative) return;
      if (snap.isHost) return;
      if (guestLeaveDidRunRef.current) return;

      // Guard against React strict-mode/dev double-invoke / rapid remounts.
      // If we mounted and "unmounted" instantly, skip to avoid leaving immediately.
      if (Date.now() - guestLeaveMountedAtRef.current < 500) return;

      guestLeaveDidRunRef.current = true;
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'loop-pre',hypothesisId:'E',location:'BaseChat2.tsx:unmount',message:'guest-unmount-calling-leave',data:{gooseSessionId:String(sessionId).slice(0,12),collabSessionId:snap.collabSessionId?snap.collabSessionId.slice(0,12):null},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
      void collab.actions.leave();
    };
  }, [sessionId, collab.actions]);
  
  // Debug: log collab state on every render
  console.log('🔷 BaseChat2 RENDER - collab state:', {
    collabMessagesCount: collab.state.messages.length,
    isCollaborative: collab.state.isCollaborative,
    collabSessionId: collab.state.session?.id,
    participantsCount: collab.state.participants.length,
  });

  // Convert Supabase collaborative messages to the local Message format
  const convertCollabMessage = useCallback((msg: SessionHumanMessage): Message => {
    console.log('🔄 Converting collab message:', {
      id: msg.id,
      type: msg.message_type,
      content: msg.content?.slice(0, 50),
      created_at: msg.created_at,
      user_id: msg.user_id,
      currentUserId: collab.state.currentUserId,
    });
    
    const isAssistant = msg.message_type === 'assistant';
    const isSystem = msg.message_type === 'system';
    const senderLabel = msg.user_display_name || msg.user_email || 'Collaborator';
    
    // Check if this message is from the current user
    const isFromSelf = msg.user_id === collab.state.currentUserId;
    
    // Format content based on message type
    let displayContent: string;
    if (isAssistant) {
      displayContent = msg.content;
    } else if (isSystem) {
      // System messages (like "X joined") get italic styling with info prefix
      displayContent = `*${msg.content}*`;
    } else if (isFromSelf) {
      // My own messages - show content as-is (will be labeled "You" by UserMessage)
      displayContent = msg.content;
    } else {
      // Messages from OTHER users - prefix with sender name for clarity
      displayContent = msg.content;
    }
    
    // Convert to seconds to match local message format (createUserMessage uses Math.floor(Date.now() / 1000))
    const createdAtMs = new Date(msg.created_at).getTime();
    const createdAtSeconds = Math.floor(createdAtMs / 1000);
    
    const converted: Message = {
      id: msg.id,
      // System messages show as user role (will be styled differently via content)
      role: isAssistant ? 'assistant' : 'user',
      created: createdAtSeconds,
      content: [{
        type: 'text',
        text: displayContent,
      }],
      // Set sender info for messages from OTHER users so UserMessage displays their name
      sender: (!isAssistant && !isFromSelf && !isSystem) ? {
        userId: msg.user_id,
        displayName: senderLabel,
        avatarUrl: undefined,
      } : undefined,
    };
    
    const firstContent = converted.content?.[0];
    console.log('✅ Converted to:', {
      id: converted.id,
      role: converted.role,
      created: converted.created,
      isFromSelf,
      hasSender: !!converted.sender,
      senderName: converted.sender?.displayName,
      contentLength: firstContent && 'text' in firstContent ? firstContent.text?.length : 0,
    });
    
    return converted;
  }, [collab.state.currentUserId]);

  // (agentContextMessages is computed above, before useChatStream is called)

  // Determine which messages to display based on collaboration mode
  // In collab mode: Supabase is the source of truth (Teams-like)
  // In solo mode: Local Goose session is the source
  const mergedMessages = useMemo(() => {
    // Check if we have active participants (more than just the host)
    const activeParticipants = collab.state.participants.filter(p => p.is_active);
    const hasActiveGuest = activeParticipants.length > 1; // More than just the host
    
    console.log('📊 MESSAGE SOURCE CHECK:', {
      isCollaborative: collab.state.isCollaborative,
      collabMessagesCount: collab.state.messages.length,
      localMessagesCount: messages.length,
      activeParticipants: activeParticipants.length,
      hasActiveGuest,
      isHost: collab.state.isHost,
      sessionId,
    });

    // SOLO MODE: Not in collaborative session, or no collab messages yet
    // Use local Goose messages
    if (!collab.state.isCollaborative || collab.state.messages.length === 0) {
      console.log('📊 SOLO MODE: Using local Goose messages');
      return messages;
    }

    // COLLAB MODE: Use Supabase messages as the ONLY source of truth
    // This is like Teams channels - everyone sees the same messages from Supabase
    console.log('📊 COLLAB MODE: Using Supabase messages as source of truth');
    
    // Convert all collab messages to the Message format
    const collabConverted = collab.state.messages.map(convertCollabMessage);
    
    // Sort by timestamp
    collabConverted.sort((a, b) => {
      const aTime = typeof a.created === 'number' ? a.created : 0;
      const bTime = typeof b.created === 'number' ? b.created : 0;
      return aTime - bTime;
    });

    console.log('📊 COLLAB MODE result:', {
      totalMessages: collabConverted.length,
      firstMessage: collabConverted[0]?.id,
      lastMessage: collabConverted[collabConverted.length - 1]?.id,
    });

    return collabConverted;
  }, [messages, collab.state.isCollaborative, collab.state.messages, collab.state.participants, convertCollabMessage]);

  // ==========================================================================
  // Collab transcript persistence (Option B):
  // When collaboration ends (guest leaves), persist the shared Supabase transcript into the
  // host's local Goose session via a dedicated import endpoint. This avoids using /reply.
  // ==========================================================================
  const prevCollaborativeModeRef = useRef<boolean>(false);

  const importCollabTranscriptToLocal = useCallback(async () => {
    if (!collab.state.isCollaborative || !collab.state.isHost) return;

    const baseUrl = apiClient.getConfig().baseUrl || '';
    const apiUrl = `${baseUrl}/sessions/${sessionId}/messages/import`;

    // Import only non-assistant messages to avoid duplicating host assistant replies which already exist locally.
    const messagesToImport = collab.state.messages
      .filter((m) => m && m.message_type !== 'assistant')
      .map((m) => {
        const created = Math.floor(new Date(m.created_at).getTime() / 1000);
        const text = m.message_type === 'system' ? `[system] ${m.content}` : m.content;
        return {
          role: 'user' as const,
          created,
          content: [{ type: 'text' as const, text }],
        };
      });

    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'persist-pre',hypothesisId:'P1',location:'BaseChat2.tsx:import',message:'import-collab-transcript-start',data:{gooseSessionId:String(sessionId).slice(0,12),collabSessionId:collab.state.session?.id?String(collab.state.session?.id).slice(0,12):null,count:messagesToImport.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log

    try {
      const secretKey = await window.electron.getSecretKey();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Secret-Key': secretKey,
          ...(apiClient.getConfig().headers || {}),
        },
        body: JSON.stringify({ messages: messagesToImport }),
      });

      const ok = response.ok;
      const status = response.status;
      const payload = await response.json().catch(() => null);

      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'persist-pre',hypothesisId:'P1',location:'BaseChat2.tsx:import',message:'import-collab-transcript-result',data:{ok,status,payload,gooseSessionId:String(sessionId).slice(0,12)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'persist-pre',hypothesisId:'P1',location:'BaseChat2.tsx:import',message:'import-collab-transcript-error',data:{error:String((e as any)?.message||e),gooseSessionId:String(sessionId).slice(0,12)},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log
    }
  }, [collab.state.isCollaborative, collab.state.isHost, collab.state.messages, collab.state.session?.id, sessionId]);

  useEffect(() => {
    if (!collab.state.isCollaborative || !collab.state.isHost) return;
    const prev = prevCollaborativeModeRef.current;
    const now = !!collab.state.collaborativeMode;
    if (prev && !now) {
      // Transition from collab-mode (guests present) → solo-mode: persist transcript.
      void importCollabTranscriptToLocal();
    }
    prevCollaborativeModeRef.current = now;
  }, [
    collab.state.isCollaborative,
    collab.state.isHost,
    collab.state.collaborativeMode,
    importCollabTranscriptToLocal,
  ]);

  // Auto-send @goose off for Matrix chats on initial load
  const hasAutoDisabledGoose = useRef(false);
  useEffect(() => {
    if (matrixRoomId && !hasAutoDisabledGoose.current && messages.length === 0 && chatState === ChatState.Idle) {
      console.log('📱 Auto-sending @goose off for Matrix chat');
      hasAutoDisabledGoose.current = true;
      // Send @goose off command automatically
      streamHandleSubmit('@goose off');
    }
  }, [matrixRoomId, messages.length, chatState, streamHandleSubmit]);

  // Create append function for adding messages programmatically
  const append = useCallback((textOrMessage: string | Message) => {
    if (typeof textOrMessage === 'string') {
      // Handle string input (for existing functionality)
      streamHandleSubmit(textOrMessage);
    } else {
      // Handle Message object input (for Matrix integration)
      const message = textOrMessage;
      console.log('📥 BaseChat2 append called with Message object:', {
        sessionId: sessionId.substring(0, 8),
        id: message.id,
        role: message.role,
        content: Array.isArray(message.content) && message.content[0]?.type === 'text' 
          ? message.content[0].text?.substring(0, 50) + '...' 
          : 'N/A',
        sender: (message as any).sender?.displayName || (message as any).sender?.userId || 'unknown'
      });
      
      // FIXED: Make Matrix message events SESSION-SPECIFIC to prevent cross-tab contamination
      // Include sessionId in the event detail so only the correct useChatStream instance processes it
      const messageEvent = new CustomEvent('matrix-message-received', {
        detail: { 
          message,
          targetSessionId: sessionId, // CRITICAL: Only this session should process this message
          timestamp: new Date().toISOString()
        }
      });
      window.dispatchEvent(messageEvent);
      
      console.log('📥 BaseChat2 dispatched SESSION-SPECIFIC matrix-message-received event:', {
        messageId: message.id,
        targetSessionId: sessionId.substring(0, 8),
        sender: (message as any).sender?.displayName || (message as any).sender?.userId || 'unknown'
      });
    }
  }, [streamHandleSubmit, sessionId]);

  // Create simple command history from messages
  const commandHistory = useMemo(() => {
    return messages
      .filter(m => m.role === 'user')
      .map(m => {
        const textContent = Array.isArray(m.content) 
          ? m.content.find(c => c.type === 'text')?.text 
          : '';
        return textContent || '';
      })
      .filter(text => text.trim())
      .reverse();
  }, [messages]);

  // Simple tool call notifications (empty for now, can be enhanced later)
  const toolCallNotifications = useMemo(() => new Map(), []);

  // Simple message update handler (for future enhancement)
  const onMessageUpdate = useCallback((messageId: string, newContent: string) => {
    console.log('Message update requested:', messageId, newContent);
    // TODO: Implement message editing functionality
  }, []);

  const handleFormSubmit = (e: React.FormEvent) => {
    const customEvent = e as unknown as CustomEvent;
    const textValue = customEvent.detail?.value || '';

    if (recipe && textValue.trim()) {
      setHasStartedUsingRecipe(true);
    }
    streamHandleSubmit(textValue);
  };

  const { sessionCosts } = useCostTracking({
    sessionInputTokens: session?.accumulated_input_tokens || 0,
    sessionOutputTokens: session?.accumulated_output_tokens || 0,
    localInputTokens: 0,
    localOutputTokens: 0,
    session,
  });

  // ==========================================================================
  // Sync session title to collaborative session
  // When the local tab title changes, update the collab session so guests see it
  // We use the tab title (which is updated from the first message) rather than
  // session?.description (which comes from backend and may be stale)
  // ==========================================================================
  const lastSyncedTitleRef = useRef<string | null>(null);
  
  // Get the current tab's title from TabContext
  const currentTabTitle = useMemo(() => {
    if (!tabId) return null;
    const tabState = tabContext.tabStates.find(ts => ts.tab.id === tabId);
    return tabState?.tab?.title || null;
  }, [tabId, tabContext.tabStates]);
  
  useEffect(() => {
    console.log('🏷️ Title sync effect - checking conditions:', {
      currentTabTitle,
      isCollaborative: collab.state.isCollaborative,
      isHost: collab.state.isHost,
      lastSyncedTitle: lastSyncedTitleRef.current,
      sessionId: collab.state.session?.id,
    });
    
    // Only sync if we're the host of a collaborative session
    if (!collab.state.isCollaborative || !collab.state.isHost) {
      console.log('🏷️ Title sync skipped: not collaborative or not host');
      return;
    }
    
    // Get the actual tab title - this is the source of truth for the UI
    const title = currentTabTitle;
    if (!title || title === 'New Chat' || title === 'Loading...') {
      console.log('🏷️ Title sync skipped: no valid title', { title });
      return;
    }
    
    // Only sync if the title has changed
    if (title === lastSyncedTitleRef.current) {
      console.log('🏷️ Title sync skipped: title unchanged');
      return;
    }
    
    console.log('🏷️ Syncing tab title to collaborative session:', title);
    lastSyncedTitleRef.current = title;
    
    collab.actions.updateTitle(title).catch((e) => {
      console.error('❌ Failed to sync session title:', e);
    });
  }, [currentTabTitle, collab.state.isCollaborative, collab.state.isHost, collab.actions, collab.state.session?.id]);

  // ==========================================================================
  // For guests: Update tab title when collab session title becomes available
  // This handles the case where the tab was created before the session was loaded
  // ==========================================================================
  useEffect(() => {
    // Only for collaborative sessions where we're NOT the host (guests)
    if (!collab.state.isCollaborative || collab.state.isHost) return;
    
    const collabTitle = collab.state.session?.title;
    if (!collabTitle || !tabId) return;
    
    // Check if current tab has a generic/placeholder title that should be updated
    const shouldUpdateTab = !currentTabTitle || 
      currentTabTitle === 'New Chat' || 
      currentTabTitle === 'Loading...' ||
      currentTabTitle === 'Chat';
    
    if (shouldUpdateTab && currentTabTitle !== collabTitle) {
      console.log('🏷️ Guest: Updating tab title from collab session:', collabTitle);
      // Use the new updateTabTitle method to avoid overwriting messages
      tabContext.updateTabTitle(tabId, collabTitle);
    }
  }, [collab.state.isCollaborative, collab.state.isHost, collab.state.session?.title, currentTabTitle, tabId, tabContext]);

  const recipe = session?.recipe;

  useEffect(() => {
    if (!recipe) return;

    (async () => {
      const accepted = await window.electron.hasAcceptedRecipeBefore(recipe);
      setHasNotAcceptedRecipe(!accepted);

      if (!accepted) {
        const scanResult = await scanRecipe(recipe);
        setHasRecipeSecurityWarnings(scanResult.has_security_warnings);
      }
    })();
  }, [recipe]);

  const handleRecipeAccept = async (accept: boolean) => {
    if (recipe && accept) {
      await window.electron.recordRecipeHash(recipe);
      setHasNotAcceptedRecipe(false);
    } else {
      setView('chat');
    }
  };

  const previousMessageCountRef = useRef(mergedMessages.length);
  const hasInitialScrollRef = useRef(false);

  // Auto-scroll only when new messages arrive or we're still streaming
  const handleRenderingComplete = React.useCallback(() => {
    const hasNewMessage = mergedMessages.length > previousMessageCountRef.current;

    if (hasNewMessage && scrollRef.current?.scrollToBottom) {
      console.log('📜 BaseChat2: SCROLLING TO BOTTOM (new message detected)');
      scrollRef.current.scrollToBottom();
    }

    previousMessageCountRef.current = mergedMessages.length;
  }, [mergedMessages.length]);

  // Scroll to bottom once when entering a conversation that already has history
  useEffect(() => {
    if (!hasInitialScrollRef.current && mergedMessages.length > 0 && scrollRef.current?.scrollToBottom) {
      hasInitialScrollRef.current = true;
      requestAnimationFrame(() => {
        console.log('📜 BaseChat2: Initial conversation scroll');
        scrollRef.current?.scrollToBottom();
      });
    }
  }, [mergedMessages.length]);

  useEffect(() => {
    hasInitialScrollRef.current = false;
  }, [sessionId]);

  const toolCount = useToolCount(sessionId);

  // Listen for global scroll-to-bottom requests (e.g., from MCP UI prompt actions)
  useEffect(() => {
    const handleGlobalScrollRequest = () => {
      // Add a small delay to ensure content has been rendered
      setTimeout(() => {
        if (scrollRef.current?.scrollToBottom) {
          scrollRef.current.scrollToBottom();
        }
      }, 200);
    };

    window.addEventListener('scroll-chat-to-bottom', handleGlobalScrollRequest);
    return () => window.removeEventListener('scroll-chat-to-bottom', handleGlobalScrollRequest);
  }, []);

  // Use the showPopularTopics prop, but also check the current state
  const shouldShowPopularTopics = showPopularTopics && 
    mergedMessages.length === 0 && !initialMessage && chatState === ChatState.Idle;

  // Debug logging for empty state
  console.log('BaseChat2 render state:', {
    sessionId: sessionId, // Show full session ID for debugging
    sessionIdShort: sessionId.slice(0, 8), // Also show truncated for readability
    messagesLength: mergedMessages.length,
    localMessagesLength: messages.length,
    collabMessagesLength: collab.state.messages.length,
    isCollaborative: collab.state.isCollaborative,
    chatState,
    shouldShowPopularTopics,
    loadingChat,
    hasSession: !!session,
    sessionName: (session as any)?.name,
    sessionDescription: session?.description
  });

  // Determine the best title to use
  // Priority: collab session title > meaningful tab title > backend session > fallback
  const chatTitle = useMemo(() => {
    // For collaborative sessions, always prefer the collab session title
    // This ensures guests see the same title as the host
    if (collab.state.isCollaborative && collab.state.session?.title) {
      console.log('🏷️ Using collab session title:', collab.state.session.title);
      return collab.state.session.title;
    }
    
    // Check if current tab has a meaningful title (not a pure placeholder)
    // Note: "New session N" is acceptable as it comes from the backend
    const isPurePlaceholder = !currentTabTitle || 
      currentTabTitle === 'New Chat' || 
      currentTabTitle === 'Loading...' ||
      currentTabTitle === 'Chat';
    
    // If tab has a title that isn't a pure placeholder, use it
    if (!isPurePlaceholder) {
      return currentTabTitle;
    }
    
    // Fall back to backend session description
    if (session?.description) {
      return session.description;
    }
    
    // Final fallback
    return mergedMessages.length > 0 ? 'Chat' : 'New Chat';
  }, [currentTabTitle, collab.state.isCollaborative, collab.state.session?.title, session?.description, mergedMessages.length]);

  // Memoize the chat object to prevent infinite re-renders
  const chat: ChatType = useMemo(() => ({
    messageHistoryIndex: 0,
    messages: mergedMessages as any,
    recipe,
    sessionId: session?.id || sessionId, // Use actual session ID if available
    name: (session as any)?.name || 'No Session',
    title: chatTitle,
  }), [mergedMessages, recipe, session?.id, sessionId, chatTitle]);

  // Update parent only when session ID or title changes (to avoid infinite loops)
  // Only call setChat if it's provided (active tabs)
  useEffect(() => {
    if (setChat) {
      setChat(chat);
    }
  }, [setChat, chat.sessionId, chat.title]);

  const initialPrompt = mergedMessages.length == 0 && recipe?.prompt ? recipe.prompt : '';

  return (
    <div className="h-full flex flex-col min-h-0 relative">
      {/* BaseChat2 - Tabbed Chat Ready */}
      
      {/* Custom header */}
      {renderHeader && renderHeader()}

      {/* Chat container - extends behind floating input */}
      <div className="absolute inset-0">
        <ScrollArea
          ref={scrollRef}
          className={`h-full relative ${contentClassName}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          data-drop-zone="true"
          paddingX={6}
          paddingY={0}
        >
          {/* Participants Bar - sticky at top, content scrolls behind it */}
          {showParticipantsBar && matrixRoomId && (
            <div className="sticky top-0 z-50 -mx-6 mb-0">
              <ParticipantsBar matrixRoomId={matrixRoomId} />
            </div>
          )}
          
          {/* Chat thread container with shared width */}
          <div className="w-full max-w-4xl mx-auto px-6">
            {/* Recipe agent header - sticky at top of chat container */}
            {recipe?.title && (
              <div className="sticky top-0 z-10 px-0 -mx-6 mb-6 pt-6">
                <RecipeHeader title={recipe.title} />
              </div>
            )}

            {/* Recipe Activities - always show when recipe is active and accepted */}
            {recipe && !hasNotAcceptedRecipe && (
              <div className={hasStartedUsingRecipe ? 'mb-6' : ''}>
                <RecipeActivities
                  append={(text: string) => append(text)}
                  activities={Array.isArray(recipe.activities) ? recipe.activities : null}
                  title={recipe.title}
                  //parameterValues={recipeParameters || {}}
                />
              </div>
            )}

            {/* Session Load Error */}
            {sessionLoadError && (
              <div className="flex flex-col items-center justify-center p-8">
                <div className="text-red-700 dark:text-red-300 bg-red-400/50 p-4 rounded-lg mb-4 max-w-md">
                  <h3 className="font-semibold mb-2">Failed to Load Session</h3>
                  <p className="text-sm">{sessionLoadError}</p>
                </div>
                <button
                  onClick={() => {
                    setView('chat');
                  }}
                  className="px-4 py-2 text-center cursor-pointer text-textStandard border border-borderSubtle hover:bg-bgSubtle rounded-lg transition-all duration-150"
                >
                  Go home
                </button>
              </div>
            )}

            {/* Messages or Popular Topics */}
            {
              loadingChat ? null : mergedMessages.length > 0 ||
                (recipe && !hasNotAcceptedRecipe && hasStartedUsingRecipe) ? (
                <>
                  {/* Spacer above first message */}
                  <div className="h-[50px]"></div>
                  
                  {disableSearch ? (
                    // Render messages without SearchView wrapper when search is disabled
                    <ProgressiveMessageList
                      messages={mergedMessages as any}
                      chat={chat}
                      toolCallNotifications={toolCallNotifications}
                      append={append}
                      appendMessage={(newMessage) => {
                        // Note: useChatStream doesn't expose setMessages, so this is a placeholder
                        console.log('appendMessage called with:', newMessage);
                      }}
                      isUserMessage={(m: any) => m.role === 'user'}
                      isStreamingMessage={chatState !== ChatState.Idle}
                      tabId={tabId}
                      onMessageUpdate={onMessageUpdate}
                      onRenderingComplete={handleRenderingComplete}
                      // Comment props
                      comments={commentState.comments}
                      activeSelection={commentState.activeSelection}
                      activePosition={commentState.activePosition}
                      activeMessageId={commentState.activeMessageId}
                      isCreatingComment={commentState.isCreatingComment}
                      onSelectionChange={commentState.setActiveSelection}
                      onCreateComment={commentState.createComment}
                      onUpdateComment={commentState.updateComment}
                      onDeleteComment={commentState.deleteComment}
                      onReplyToComment={commentState.replyToComment}
                      onResolveComment={commentState.resolveComment}
                      onCancelComment={() => commentState.setActiveSelection(null)}
                      onFocusComment={commentState.focusComment}
                    />
                  ) : (
                    // Render messages with SearchView wrapper when search is enabled
                    <SearchView>
                      <ProgressiveMessageList
                        messages={mergedMessages as any}
                        chat={chat}
                        toolCallNotifications={toolCallNotifications}
                        append={append}
                        appendMessage={(newMessage) => {
                          // Note: useChatStream doesn't expose setMessages, so this is a placeholder
                          console.log('appendMessage called with:', newMessage);
                        }}
                        isUserMessage={(m: any) => m.role === 'user'}
                        isStreamingMessage={chatState !== ChatState.Idle}
                        tabId={tabId}
                        onMessageUpdate={onMessageUpdate}
                        onRenderingComplete={handleRenderingComplete}
                        // Comment props
                        comments={commentState.comments}
                        activeSelection={commentState.activeSelection}
                        activePosition={commentState.activePosition}
                        activeMessageId={commentState.activeMessageId}
                        isCreatingComment={commentState.isCreatingComment}
                        onSelectionChange={commentState.setActiveSelection}
                        onCreateComment={commentState.createComment}
                        onUpdateComment={commentState.updateComment}
                        onDeleteComment={commentState.deleteComment}
                        onReplyToComment={commentState.replyToComment}
                        onResolveComment={commentState.resolveComment}
                        onCancelComment={() => commentState.setActiveSelection(null)}
                        onFocusComment={commentState.focusComment}
                      />
                    </SearchView>
                  )}

                  {/* Inline loading indicator below messages */}
                  {chatState !== ChatState.Idle && (
                    <div className="px-6 py-2">
                      <LoadingGoose
                        chatState={chatState}
                        message={
                          messages.length > 0 && messages[messages.length - 1].id != null
                            ? getThinkingMessage(messages[messages.length - 1] as any)
                            : undefined
                        }
                      />
                    </div>
                  )}

                  {/* Spacer so latest messages don't sit under input */}
                  <div className="h-56" />
                </>
              ) : !recipe && shouldShowPopularTopics ? (
                /* Show PopularChatTopics when no messages, no recipe, and showPopularTopics is true */
                <div className="absolute bottom-0 left-0 right-0 flex justify-start pb-32">
                  <div className="max-w-4xl mx-auto w-full flex flex-col-reverse px-6">
                    <PopularChatTopics append={(text: string) => append(text)} />

                    {/* Show pending invites above popular topics if enabled */}
                    {showPendingInvites && (
                      <PendingInvitesInHistory showInChatHistory={false} />
                    )}
                  </div>
                </div>
              ) : showPendingInvites ? (
                /* Show only pending invites when no messages and showPendingInvites is true */
                <div className="absolute bottom-0 left-0 right-0 flex justify-start pb-32">
                  <div className="max-w-4xl mx-auto w-full px-6">
                    <PendingInvitesInHistory showInChatHistory={false} />
                  </div>
                </div>
              ) : null /* Show nothing when messages.length === 0 && suppressEmptyState === true */
            }

            {/* Loading indicator for initial chat loading */}
            {loadingChat && (
              <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="text-center">
                  <LoadingGoose
                    message="Loading conversation..."
                    chatState={ChatState.Idle}
                  />
                  <p className="text-text-muted text-sm mt-4">
                    Fetching message history...
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Floating Chat Input */}
      <div
        className={`absolute left-0 right-0 bottom-0 z-20 pointer-events-none ${
          disableAnimation ? '' : 'animate-[fadein_400ms_ease-in_forwards]'
        }`}
        // NOTE:
        // We intentionally avoid forcing a composited layer here.
        // In Electron/Chromium, backdrop-filter inside/under transformed ancestors can
        // intermittently stop rendering after window resize even though computed styles remain.
      >
        <div className="pointer-events-auto">
          <ChatInput
            sessionId={sessionId}
            tabId={tabId}
            isCollaborativeJoin={isCollaborativeJoin}
            handleSubmit={handleFormSubmit}
            chatState={chatState}
            onStop={stopStreaming}
            collab={collab}
            commandHistory={commandHistory}
            initialValue={initialPrompt}
            setView={setView}
            numTokens={tokenState?.totalTokens ?? session?.total_tokens ?? undefined}
            inputTokens={
              tokenState?.accumulatedInputTokens ?? session?.accumulated_input_tokens ?? undefined
            }
            outputTokens={
              tokenState?.accumulatedOutputTokens ?? session?.accumulated_output_tokens ?? undefined
            }
            droppedFiles={droppedFiles}
            onFilesProcessed={() => setDroppedFiles([])} // Clear dropped files after processing
            messages={messages as any}
            setMessages={() => {}} // Placeholder - useChatStream doesn't expose setMessages
            // Keep the composer out of opacity/transition animations.
            // In Electron/Chromium, backdrop-filter can stop rendering after resize when
            // the blurred element is inside an opacity-animated subtree (e.g. .page-transition).
            disableAnimation={true}
            sessionCosts={sessionCosts}
            setIsGoosehintsModalOpen={setIsGoosehintsModalOpen}
            recipeConfig={recipe}
            recipeAccepted={!hasNotAcceptedRecipe}
            initialPrompt={initialPrompt}
            toolCount={toolCount || 0}
            autoSubmit={false}
            append={append as any}
            gooseEnabled={gooseEnabled}
            {...customChatInputProps}
          />
        </div>
      </div>

      {recipe && (
        <RecipeWarningModal
          isOpen={!!hasNotAcceptedRecipe}
          onConfirm={() => handleRecipeAccept(true)}
          onCancel={() => handleRecipeAccept(false)}
          recipeDetails={{
            title: recipe.title,
            description: recipe.description,
            instructions: recipe.instructions || undefined,
          }}
          hasSecurityWarnings={hasRecipeSecurityWarnings}
        />
      )}

      {recipe?.parameters && recipe.parameters.length > 0 && !(session as any)?.user_recipe_values && (
        <ParameterInputModal
          parameters={recipe.parameters}
          onSubmit={setRecipeUserParams}
          onClose={() => setView('chat')}
        />
      )}

      {/*/!* Create Recipe from Session Modal *!/*/}
      {/*<CreateRecipeFromSessionModal*/}
      {/*  isOpen={isCreateRecipeModalOpen}*/}
      {/*  onClose={() => setIsCreateRecipeModalOpen(false)}*/}
      {/*  sessionId={chat.sessionId}*/}
      {/*  onRecipeCreated={handleRecipeCreated}*/}
      {/*/>*/}
    </div>
  );
}

export default function BaseChat(props: BaseChatProps) {
  return <BaseChatContent {...props} />;
}
