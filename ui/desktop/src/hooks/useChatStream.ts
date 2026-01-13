import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatState } from '../types/chatState';

import {
  resumeAgent,
  Session,
  // updateSessionUserRecipeValues, // TODO: Implement this API endpoint
} from '../api';
import { client } from '../api/client.gen';
import { 
  Message, 
  createUserMessage, 
  getCompactingMessage, 
  getThinkingMessage 
} from '../types/message';

// Local type definitions for SSE events
interface TokenState {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  accumulatedInputTokens: number;
  accumulatedOutputTokens: number;
  accumulatedTotalTokens: number;
}

type MessageEvent = 
  | { type: 'Message'; message: Message; token_state: TokenState }
  | { type: 'Error'; error: string }
  | { type: 'Finish'; reason: string }
  | { type: 'ModelChange'; model: string; mode: string }
  | { type: 'UpdateConversation'; conversation: Message[] }
  | { type: 'Notification'; message: string }
  | { type: 'Ping' };

// Helper to convert API messages to local Message type
// The API Message has `id: string | null | undefined` while local has `id?: string`
function convertApiMessage(apiMsg: any): Message {
  return {
    ...apiMsg,
    id: apiMsg.id ?? undefined,
    created: apiMsg.created ?? Math.floor(Date.now() / 1000),
  } as Message;
}

function convertApiMessages(apiMsgs: any[]): Message[] {
  return apiMsgs.map(convertApiMessage);
}


const resultsCache = new Map<string, { messages: Message[]; session: Session }>();

// Expose cache globally for debugging and cache clearing
if (typeof window !== 'undefined') {
  (window as any).__useChatStreamCache = resultsCache;
}

// Session creation tracking to prevent conflicts
const sessionCreationInProgress = new Set<string>();

// Debug logging - set to false in production
const DEBUG_CHAT_STREAM = true;

// Check if a message contains goose commands or mentions that shouldn't trigger AI response
// Returns an object with skipAI flag and new goose state
const GOOSE_OFF_COMMANDS = ['@goose off', '@goose stop', '@goose quiet', '@goose pause'] as const;

function checkForGooseCommands(message: string, currentGooseEnabled: boolean): { 
  skipAI: boolean; 
  newGooseEnabled: boolean;
  isGooseCommand: boolean;
} {
  console.log('🦆 checkForGooseCommands called:', {
    message: message.slice(0, 100),
    currentGooseEnabled,
  });
  
  const trimmedMessage = message.trim().toLowerCase();
  
  // Check for goose OFF commands (must be exact matches)
  for (const command of GOOSE_OFF_COMMANDS) {
    if (trimmedMessage === command) {
      console.log('🦆 Goose turned OFF with command:', command);
      return { skipAI: true, newGooseEnabled: false, isGooseCommand: true };
    }
  }
  
  // Check for @goose mention anywhere in the message (case-insensitive)
  const gooseMentionPattern = /@goose\b/i;
  const containsGooseMention = gooseMentionPattern.test(message);
  
  // If goose is disabled and message contains @goose, turn it back on
  if (!currentGooseEnabled && containsGooseMention) {
    console.log('🦆 Goose turned ON - detected @goose mention in message');
    return { skipAI: false, newGooseEnabled: true, isGooseCommand: false };
  }
  
  // If goose is disabled and no @goose mention, skip AI response
  if (!currentGooseEnabled) {
    console.log('🦆 Goose is OFF - skipping AI response');
    return { skipAI: true, newGooseEnabled: currentGooseEnabled, isGooseCommand: false };
  }
  
  // Check for friend mentions (various patterns)
  // These patterns indicate a user is @mentioning someone OTHER than goose
  
  // Matrix user IDs: @user:domain.com
  const matrixUserPattern = /@[a-zA-Z0-9._-]+:[a-zA-Z0-9.-]+/;
  
  // Email-style mentions: @email@domain.com (like @hello@getantelope.com)
  const emailMentionPattern = /@[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  
  // Simple @username mentions anywhere in the message (not just at start)
  // but exclude @goose
  const simpleMentionPattern = /@([a-zA-Z0-9._-]+)(?:\s|$|[,!?.])/;
  
  // Check Matrix-style mentions
  if (matrixUserPattern.test(message)) {
    console.log('👥 Detected Matrix user mention - skipping AI response');
    return { skipAI: true, newGooseEnabled: currentGooseEnabled, isGooseCommand: false };
  }
  
  // Check email-style mentions (like @hello@getantelope.com)
  const emailMatch = emailMentionPattern.test(message);
  console.log('🦆 Email mention check:', { pattern: emailMentionPattern.source, message: message.slice(0, 50), match: emailMatch });
  if (emailMatch) {
    console.log('👥 Detected email user mention - skipping AI response');
    return { skipAI: true, newGooseEnabled: currentGooseEnabled, isGooseCommand: false };
  }
  
  // Check simple @username mentions (but not @goose)
  const simpleMentionMatch = message.match(simpleMentionPattern);
  if (simpleMentionMatch && simpleMentionMatch[1].toLowerCase() !== 'goose') {
    console.log('👥 Detected user mention:', simpleMentionMatch[1], '- skipping AI response');
    return { skipAI: true, newGooseEnabled: currentGooseEnabled, isGooseCommand: false };
  }
  
  return { skipAI: false, newGooseEnabled: currentGooseEnabled, isGooseCommand: false };
}

const log = {
  session: (action: string, sessionId: string, details?: Record<string, unknown>) => {
    if (!DEBUG_CHAT_STREAM) return;
    console.log(`[useChatStream:session] ${action}`, {
      sessionId: sessionId.slice(0, 8),
      ...details,
    });
  },
  messages: (action: string, count: number, details?: Record<string, unknown>) => {
    if (!DEBUG_CHAT_STREAM) return;
    console.log(`[useChatStream:messages] ${action}`, {
      count,
      ...details,
    });
  },
  stream: (action: string, details?: Record<string, unknown>) => {
    if (!DEBUG_CHAT_STREAM) return;
    console.log(`[useChatStream:stream] ${action}`, details);
  },
  state: (newState: ChatState, details?: Record<string, unknown>) => {
    if (!DEBUG_CHAT_STREAM) return;
    console.log(`[useChatStream:state] → ${newState}`, details);
  },
  error: (context: string, error: unknown) => {
    console.error(`[useChatStream:error] ${context}`, error);
  },
};

interface UseChatStreamProps {
  sessionId: string;
  onStreamFinish: () => void;
  initialMessage?: string;
  onSessionIdChange?: (newSessionId: string) => void;
  isMatrixTab?: boolean; // Flag to indicate if this is a Matrix tab that should listen for Matrix messages
  tabId?: string; // Tab ID to filter sidecars for context injection
  matrixRoomId?: string; // Matrix room ID for loading historical messages
  isCollaborativeJoin?: boolean; // Flag to indicate this is joining a collaborative session (Goose disabled initially)
  gooseMentionOnly?: boolean; // When true: Goose only responds if message includes @goose (no persistent enabling)
  agentContextMessages?: Message[]; // Optional: full conversation context to send to the agent (e.g. Supabase collab history)
}

interface UseChatStreamReturn {
  session?: Session;
  messages: Message[];
  chatState: ChatState;
  handleSubmit: (userMessage: string) => Promise<void>;
  setRecipeUserParams: (values: Record<string, string>) => Promise<void>;
  stopStreaming: () => void;
  sessionLoadError?: string;
  tokenState: TokenState;
  gooseEnabled: boolean;
}

function pushMessage(currentMessages: Message[], incomingMsg: Message): Message[] {
  const lastMsg = currentMessages[currentMessages.length - 1];

  if (lastMsg?.id && lastMsg.id === incomingMsg.id) {
    const lastContent = lastMsg.content[lastMsg.content.length - 1];
    const newContent = incomingMsg.content[incomingMsg.content.length - 1];

    if (
      lastContent?.type === 'text' &&
      newContent?.type === 'text' &&
      incomingMsg.content.length === 1
    ) {
      lastContent.text += newContent.text;
    } else {
      lastMsg.content.push(...incomingMsg.content);
    }
    return [...currentMessages];
  } else {
    return [...currentMessages, incomingMsg];
  }
}

// Parse SSE stream from a Response object
async function* parseSSEStreamFromResponse(response: Response): AsyncIterable<MessageEvent> {
  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    let running = true;
    while (running) {
      const { done, value } = await reader.read();
      if (done) {
        running = false;
        break;
      }

      // Decode the chunk and add it to our buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE events
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep the last incomplete event in the buffer

      for (const event of events) {
        if (event.startsWith('data: ')) {
          try {
            const data = event.slice(6); // Remove 'data: ' prefix
            const parsedEvent = JSON.parse(data) as MessageEvent;
            yield parsedEvent;
          } catch (e) {
            console.error('Error parsing SSE event:', e);
            // Skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function streamFromResponse(
  stream: AsyncIterable<MessageEvent>,
  initialMessages: Message[],
  updateMessages: (messages: Message[]) => void,
  updateTokenState: (tokenState: TokenState) => void,
  updateChatState: (state: ChatState) => void,
  onFinish: (error?: string) => void
): Promise<void> {
  let messageEventCount = 0;
  let currentMessages = initialMessages;

  try {
    log.stream('reading-events');

    for await (const event of stream) {
      switch (event.type) {
        case 'Message': {
          messageEventCount++;
          const msg = event.message;
          currentMessages = pushMessage(currentMessages, msg);

          if (getCompactingMessage(msg)) {
            log.state(ChatState.Compacting, { reason: 'compacting notification' });
            updateChatState(ChatState.Compacting);
          } else if (getThinkingMessage(msg)) {
            log.state(ChatState.Thinking, { reason: 'thinking notification' });
            updateChatState(ChatState.Thinking);
          }

          if (messageEventCount % 10 === 0) {
            log.stream('message-chunk', {
              eventCount: messageEventCount,
              messageCount: currentMessages.length,
            });
          }

          updateTokenState(event.token_state);

          updateMessages(currentMessages);
          break;
        }
        case 'Error': {
          log.error('stream event error', event.error);
          onFinish('Stream error: ' + event.error);
          return;
        }
        case 'Finish': {
          log.stream('finish-event', { reason: event.reason });
          onFinish();
          return;
        }
        case 'ModelChange': {
          log.stream('model-change', {
            model: event.model,
            mode: event.mode,
          });
          break;
        }
        case 'UpdateConversation': {
          log.messages('conversation-update', event.conversation.length);
          // WARNING: Since Message handler uses this local variable, we need to update it here to avoid the client clobbering it.
          // Longterm fix is to only send the agent the new messages, not the entire conversation.
          currentMessages = event.conversation;
          updateMessages(event.conversation);
          break;
        }
        case 'Notification':
        case 'Ping':
          break;
      }
    }

    log.stream('events-complete', { messageEvents: messageEventCount });
    onFinish();
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      log.error('stream read error', error);
      onFinish('Stream error: ' + error);
    }
  }
}

export function useChatStream({
  sessionId,
  onStreamFinish,
  initialMessage,
  onSessionIdChange,
  isMatrixTab = false,
  tabId,
  matrixRoomId,
  isCollaborativeJoin = false,
  gooseMentionOnly = false,
  agentContextMessages,
}: UseChatStreamProps): UseChatStreamReturn {
  
  // Debug logging for Matrix parameters (only when actually in a Matrix tab)
  if (isMatrixTab) {
    console.log('🔧 useChatStream called with Matrix params:', {
      sessionId: sessionId?.substring(0, 8),
      fullSessionId: sessionId, // Show full session ID for debugging
      isMatrixTab,
      matrixRoomId: matrixRoomId ? matrixRoomId.substring(0, 20) + '...' : 'undefined',
      tabId,
    });
  }
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const [session, setSession] = useState<Session>();
  const [sessionLoadError, setSessionLoadError] = useState<string>();
  const [chatState, setChatState] = useState<ChatState>(ChatState.Idle);
  // Goose starts disabled for collaborative joins and for mention-only mode (only responds to @goose)
  const [gooseEnabled, setGooseEnabled] = useState<boolean>(!isCollaborativeJoin && !gooseMentionOnly);
  const wasForcedMentionOnlyRef = useRef(false);
  const [tokenState, setTokenState] = useState<TokenState>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    accumulatedInputTokens: 0,
    accumulatedOutputTokens: 0,
    accumulatedTotalTokens: 0,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (session) {
      resultsCache.set(sessionId, { session, messages });
    }
  }, [sessionId, session, messages]);

  // Mention-only mode (collaboration): force Goose OFF for everyone.
  // When the guest leaves (mention-only false again), restore Goose ON automatically.
  useEffect(() => {
    if (gooseMentionOnly) {
      if (gooseEnabled) {
        wasForcedMentionOnlyRef.current = true;
      }
      if (gooseEnabled !== false) {
        setGooseEnabled(false);
      }
      return;
    }

    if (wasForcedMentionOnlyRef.current) {
      setGooseEnabled(true);
      wasForcedMentionOnlyRef.current = false;
    }
  }, [gooseMentionOnly, gooseEnabled]);

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log(`useChatStream render #${renderCountRef.current}, ${session?.id}`);

  const setMessagesAndLog = useCallback((newMessages: Message[], logContext: string) => {
    log.messages(logContext, newMessages.length, {
      lastMessageRole: newMessages[newMessages.length - 1]?.role,
      lastMessageId: newMessages[newMessages.length - 1]?.id?.slice(0, 8),
    });
    setMessages(newMessages);
    messagesRef.current = newMessages;
  }, []);

  const onFinish = useCallback(
    (error?: string): void => {
      if (error) {
        setSessionLoadError(error);
      }
      setChatState(ChatState.Idle);
      onStreamFinish();
    },
    [onStreamFinish]
  );

  // Load session on mount or sessionId change
  useEffect(() => {
    console.log('🔄 useChatStream useEffect fired:', {
      sessionId,
      hasSessionId: !!sessionId,
      sessionIdLength: sessionId?.length,
      willReturn: !sessionId,
      currentSession: session?.id,
      currentMessagesLength: messages.length
    });
    
    if (!sessionId) {
      console.log('🔄 Returning early - no sessionId');
      return;
    }

    // CRITICAL FIX: Don't reset state if we're just switching from temp to real session ID
    // for the same logical session (prevents Matrix chat reload issue)
    const isSessionIdUpdate = session?.id && session.id !== sessionId && 
      (sessionId.startsWith('temp_') || session.id.startsWith('temp_'));
    
    if (isSessionIdUpdate && messages.length > 0) {
      console.log('🔄 Session ID update detected with existing messages, preserving state:', {
        from: session.id,
        to: sessionId,
        messagesLength: messages.length
      });
      // Just update the session ID reference without resetting state
      if (session) {
        setSession({ ...session, id: sessionId });
      }
      return;
    }

    // Reset state when sessionId changes (but allow initial loading)
    log.session('loading', sessionId, {
      previousSessionId: session?.id,
      currentMessagesCount: messages.length,
      willReset: true
    });
    setMessagesAndLog([], 'session-reset');
    setSession(undefined);
    setSessionLoadError(undefined);
    setChatState(ChatState.Idle);

    // Check if this is a cached session first
    const cached = resultsCache.get(sessionId);
    if (cached && cached.messages.length > 0) {
      // Only use cache if it has messages - empty cache means we haven't loaded yet
      log.session('loaded-from-cache', sessionId, {
        messageCount: cached.messages.length,
        sessionDescription: cached.session.description,
      });
      setSession(cached.session);
      setMessagesAndLog(cached.messages, 'load-cached');
      setChatState(ChatState.Idle);
      return;
    } else if (cached && cached.messages.length === 0) {
      // Cache exists but is empty - clear it and load from backend
      log.session('cache-empty-clearing', sessionId, {
        note: 'cached session has no messages, will load from backend'
      });
      resultsCache.delete(sessionId);
    }

    // Try to load existing session from backend first
    const loadExistingSession = async () => {
      // Skip backend loading for sessions that start with 'new_' or 'temp_' (these are truly new)
      if (sessionId.startsWith('new_') || sessionId.startsWith('temp_')) {
        log.session('new-or-temp-session', sessionId, { note: 'will create on first message or waiting for real session ID' });
        setChatState(ChatState.Idle);
        setSession(undefined);
        setMessagesAndLog([], 'new-or-temp-session');
        setSessionLoadError(undefined);
        return;
      }

      // Skip backend loading for collaborative joins - messages come from Supabase instead
      if (isCollaborativeJoin) {
        log.session('collaborative-join', sessionId, { note: 'skipping backend load - messages from Supabase' });
        console.log('🤝 Collaborative join - skipping resumeAgent, messages will come from Supabase');
        setChatState(ChatState.Idle);
        setSession(undefined);
        setMessagesAndLog([], 'collaborative-join');
        setSessionLoadError(undefined);
        return;
      }

      try {
        log.session('attempting-resume', sessionId);
        setChatState(ChatState.Thinking);

        console.log('🔄 About to call resumeAgent with sessionId:', sessionId);
        
        // Try to resume the existing session
        const resumeResponse = await resumeAgent({
          body: { session_id: sessionId },
          throwOnError: true,
        });

        console.log('🔄 resumeAgent response:', {
          hasData: !!resumeResponse.data,
          sessionId: resumeResponse.data?.id,
          conversationLength: resumeResponse.data?.conversation?.length,
          fullResponse: resumeResponse
        });

        if (resumeResponse.data) {
          const loadedSession = resumeResponse.data;
          const conversation = loadedSession.conversation || [];
          
          // Check if we actually got valid session data
          if (!loadedSession || !loadedSession.id) {
            console.log('🔄 Resume response missing session data:', resumeResponse.data);
            throw new Error('Resume response missing session data');
          }
          
          // Convert API messages to local Message type
          const localMessages = convertApiMessages(conversation);
          
          // Get text content safely with type narrowing
          const getFirstTextContent = (msg: Message) => {
            const firstContent = msg.content[0];
            return firstContent && 'text' in firstContent ? firstContent.text?.slice(0, 100) : undefined;
          };
          
          console.log('🔄 Processing resumed session:', {
            sessionId: loadedSession.id,
            sessionDescription: loadedSession.description,
            conversationLength: localMessages.length,
            firstFewMessages: localMessages.slice(0, 3).map(m => ({
              role: m.role,
              content: getFirstTextContent(m)
            }))
          });
          
          log.session('resumed-existing', sessionId, {
            messageCount: localMessages.length,
            sessionDescription: loadedSession.description,
            conversationPreview: localMessages.slice(0, 2).map(m => {
              const firstContent = m.content[0];
              const text = firstContent && 'text' in firstContent ? firstContent.text?.slice(0, 50) : '';
              return `${m.role}: ${text}...`;
            })
          });

          setSession(loadedSession);
          setMessagesAndLog(localMessages, 'load-existing');
          
          // Cache the loaded session and messages immediately
          resultsCache.set(sessionId, { session: loadedSession, messages: localMessages });
          
          setChatState(ChatState.Idle);
          
          console.log('🔄 Session loaded successfully, messages set to:', conversation.length);
        } else {
          log.session('resume-response-empty', sessionId);
          console.log('🔄 Resume response was empty');
        }
      } catch (error) {
        log.session('resume-failed', sessionId, { error });
        console.log('🔄 Resume failed:', error);
        
        // If resume fails, treat as new session
        log.session('treating-as-new', sessionId, { note: 'resume failed, will create on first message' });
        setSession(undefined);
        setMessagesAndLog([], 'new-after-resume-fail');
        setSessionLoadError(undefined);
        setChatState(ChatState.Idle);
      }
    };

    loadExistingSession();
  }, [sessionId, setMessagesAndLog]);

  // Load Matrix room history for Matrix tabs
  useEffect(() => {
    console.log('📜 useChatStream: Matrix history effect triggered:', {
      sessionId: sessionId.substring(0, 8),
      isMatrixTab,
      matrixRoomId: matrixRoomId ? matrixRoomId.substring(0, 20) + '...' : 'null',
      messagesLength: messages.length,
      willSkip: !isMatrixTab || !matrixRoomId || messages.length > 0
    });

    // Only load Matrix history if this is a Matrix tab with a room ID and we have no messages yet
    if (!isMatrixTab || !matrixRoomId || messages.length > 0) {
      console.log('📜 useChatStream: Skipping Matrix history load:', {
        reason: !isMatrixTab ? 'not Matrix tab' : !matrixRoomId ? 'no room ID' : 'already has messages'
      });
      return;
    }

    console.log('📜 useChatStream: Loading Matrix room history for Matrix tab:', {
      sessionId: sessionId.substring(0, 8),
      matrixRoomId: matrixRoomId.substring(0, 20) + '...',
      isMatrixTab,
      messagesLength: messages.length
    });

    const loadMatrixHistory = async () => {
      try {
        // Import Matrix service dynamically to avoid circular dependencies
        const { matrixService } = await import('../services/MatrixService');
        
        console.log('📜 useChatStream: Calling getRoomHistory for Matrix room:', matrixRoomId);
        const history = await matrixService.getRoomHistory(matrixRoomId, 100);
        
        console.log('📜 useChatStream: Raw Matrix history response:', {
          historyLength: history.length,
          firstFewMessages: history.slice(0, 3).map(msg => ({
            sender: msg.sender,
            content: msg.content?.substring(0, 50) + '...',
            timestamp: msg.timestamp,
            type: msg.type // 'assistant' for Goose messages
          }))
        });

        if (history.length === 0) {
          console.log('📜 useChatStream: No Matrix history found for room');
          return;
        }

        // Convert Matrix history to Message format
        const historicalMessages: Message[] = history.map((msg, index) => {
          // GOOSE AVATAR FIX: Use msg.type instead of msg.isGooseMessage for historical messages
          const isGooseMessage = msg.type === 'assistant';
          
          // Override sender info for Goose messages to ensure proper avatar display
          let senderData;
          if (isGooseMessage) {
            senderData = {
              userId: 'goose-ai-assistant',
              displayName: 'Goose',
              avatarUrl: undefined, // Let the UI use the default Goose avatar
              isGoose: true, // Special flag to indicate this is Goose
            };
            console.log('🦆 useChatStream: Detected historical Goose message, overriding sender info');
          } else {
            senderData = msg.senderInfo ? {
              userId: msg.senderInfo.userId,
              displayName: msg.senderInfo.displayName,
              avatarUrl: msg.senderInfo.avatarUrl,
            } : {
              userId: msg.sender,
              displayName: msg.sender.split(':')[0].substring(1), // Extract username from Matrix ID
            };
          }
          
          return {
            id: `matrix-history-${msg.timestamp.getTime()}-${msg.sender}-${index}`,
            role: isGooseMessage ? 'assistant' : 'user',
            created: Math.floor(msg.timestamp.getTime() / 1000),
            content: [{
              type: 'text',
              text: msg.content,
            }],
            sender: senderData,
            metadata: {
              isFromMatrix: true,
              originalTimestamp: msg.timestamp.getTime(),
              isGooseMessage: isGooseMessage, // Flag for UI to show Goose styling
            }
          };
        });

        // Sort messages chronologically
        historicalMessages.sort((a, b) => (a.metadata?.originalTimestamp || 0) - (b.metadata?.originalTimestamp || 0));

        // Helper to safely get text content
        const getTextFromContent = (content: any) => {
          return content && 'text' in content ? content.text?.substring(0, 50) + '...' : '[non-text]';
        };

        console.log('📜 useChatStream: Converted Matrix history to messages:', {
          messageCount: historicalMessages.length,
          firstMessage: historicalMessages[0] ? {
            id: historicalMessages[0].id,
            role: historicalMessages[0].role,
            sender: historicalMessages[0].sender?.displayName || historicalMessages[0].sender?.userId,
            content: getTextFromContent(historicalMessages[0].content[0])
          } : null,
          lastMessage: historicalMessages[historicalMessages.length - 1] ? {
            id: historicalMessages[historicalMessages.length - 1].id,
            role: historicalMessages[historicalMessages.length - 1].role,
            sender: historicalMessages[historicalMessages.length - 1].sender?.displayName || historicalMessages[historicalMessages.length - 1].sender?.userId,
            content: getTextFromContent(historicalMessages[historicalMessages.length - 1].content[0])
          } : null
        });

        // Set the historical messages
        setMessagesAndLog(historicalMessages, 'matrix-history-loaded');

        console.log('✅ useChatStream: Successfully loaded Matrix room history:', {
          sessionId: sessionId.substring(0, 8),
          matrixRoomId: matrixRoomId.substring(0, 20) + '...',
          messageCount: historicalMessages.length
        });

      } catch (error) {
        console.error('❌ useChatStream: Failed to load Matrix room history:', error);
        // Don't show error to user, just log it - the chat can still work without history
      }
    };

    loadMatrixHistory();
  }, [isMatrixTab, matrixRoomId, messages.length, sessionId, setMessagesAndLog]);

  const handleSubmit = useCallback(
    async (userMessage: string) => {
      // Collaborative join tabs (guests) must never create/run a local agent session.
      // Their messages are written to Supabase and rendered from Supabase as the source of truth.
      if (isCollaborativeJoin) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'loop-pre',hypothesisId:'F',location:'useChatStream.ts:handleSubmit',message:'collab-join-submit-ignored',data:{gooseSessionId:String(sessionId).slice(0,12),msgLen:userMessage.length,hasGoose:/@goose\\b/i.test(userMessage)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion agent log
        return;
      }
      log.messages('user-submit', messagesRef.current.length + 1, {
        userMessageLength: userMessage.length,
      });

      // Check if this is a goose control command or mention that shouldn't trigger AI response.
      // In mention-only mode, @goose is a one-shot trigger (does NOT permanently enable Goose).
      const commandResult = (() => {
        if (!gooseMentionOnly) {
          return checkForGooseCommands(userMessage, gooseEnabled);
        }

        const trimmed = userMessage.trim().toLowerCase();
        const isGooseOffCommand = (GOOSE_OFF_COMMANDS as readonly string[]).includes(trimmed);
        const containsGooseMention = /@goose\b/i.test(userMessage);

        if (isGooseOffCommand) {
          return { skipAI: true, newGooseEnabled: false, isGooseCommand: true };
        }

        if (containsGooseMention) {
          // Trigger AI, but keep Goose disabled (mention-only).
          return { skipAI: false, newGooseEnabled: false, isGooseCommand: false };
        }

        return { skipAI: true, newGooseEnabled: false, isGooseCommand: false };
      })();
      
      // Inject sidecar context into the user message before creating the message object
      let messageWithContext = userMessage;
      
      // Get unified sidecar context from global window object
      const unifiedSidecarContext = (window as any).__unifiedSidecarContext;
      
      if (unifiedSidecarContext && unifiedSidecarContext.getSidecarContext) {
        try {
          let activeSidecars = unifiedSidecarContext.getActiveSidecars ? unifiedSidecarContext.getActiveSidecars() : [];
          console.log('🔧 useChatStream: All active sidecars:', activeSidecars.length);
          console.log('🔧 useChatStream: All sidecar details:', 
            activeSidecars.map((s: any) => ({ 
              id: s.id, 
              type: s.type, 
              title: s.title,
              fileName: s.fileName,
              filePath: s.filePath 
            })));
          
          // Filter sidecars by tabId if provided
          if (tabId) {
            const tabPrefix = `tab-${tabId}-`;
            activeSidecars = activeSidecars.filter((s: any) => s.id.startsWith(tabPrefix));
            console.log('🔧 useChatStream: Filtered to tab', tabId, ':', activeSidecars.length, 'sidecars');
            console.log('🔧 useChatStream: Tab-filtered sidecar details:', 
              activeSidecars.map((s: any) => ({ 
                id: s.id, 
                type: s.type, 
                title: s.title 
              })));
          }
          
          // Generate context only from filtered sidecars
          // We need to temporarily override the context to only include our filtered sidecars
          const contextInfo = activeSidecars.length > 0 
            ? generateContextForSidecars(activeSidecars)
            : '';
            
          console.log('🔧 useChatStream: Generated context info length:', contextInfo.length, 'chars');
          if (contextInfo.length > 0) {
            console.log('🔧 useChatStream: Context preview:', contextInfo.substring(0, 500));
          }
          
          if (contextInfo.trim()) {
            // Prepend context to user message
            messageWithContext = `${contextInfo}\n\n---\n\n${userMessage}`;
            console.log('🔧 useChatStream: Successfully injected sidecar context');
          } else {
            console.log('🔧 useChatStream: Context info is empty, not injecting');
          }
        } catch (error) {
          console.error('🔧 useChatStream: Error injecting sidecar context:', error);
        }
      } else {
        console.log('🔧 useChatStream: No unified sidecar context found on window object');
      }
      
      // Helper function to generate context from filtered sidecars
      function generateContextForSidecars(sidecars: any[]): string {
        if (sidecars.length === 0) return '';
        
        let contextParts: string[] = [];
        contextParts.push('## Active Tools & Context');
        contextParts.push('The user currently has the following tools and content open in sidecars:');
        contextParts.push('');

        sidecars.forEach((sidecar, index) => {
          contextParts.push(`### ${index + 1}. ${sidecar.type} - ${sidecar.title}`);
          if (sidecar.fileName) {
            contextParts.push(`File: **${sidecar.fileName}**`);
          }
          if (sidecar.filePath) {
            contextParts.push(`Path: ${sidecar.filePath}`);
          }
          contextParts.push('');
        });

        contextParts.push('Use this context to provide more relevant assistance based on the tools and content the user is actively working with.');
        contextParts.push('');

        return contextParts.join('\n');
      }
      
      const newUserMsg = createUserMessage(messageWithContext);
      const currentMessages = [...messagesRef.current, newUserMsg];
      setMessagesAndLog(currentMessages, 'user-entered');

      // Update goose enabled state if it changed (skip in mention-only mode; it's forced off)
      if (!gooseMentionOnly && commandResult.newGooseEnabled !== gooseEnabled) {
        setGooseEnabled(commandResult.newGooseEnabled);
        console.log('🦆 Goose state changed:', commandResult.newGooseEnabled ? 'ENABLED' : 'DISABLED');
      }

      // If this is a goose control command or mention, or goose is disabled, don't send to AI
      if (commandResult.skipAI) {
        const reason = commandResult.isGooseCommand 
          ? 'goose control command' 
          : !gooseEnabled 
            ? 'goose is disabled'
            : 'user mention detected';
            
        log.messages('skipping-ai-for-command', currentMessages.length, {
          reason,
          message: userMessage.slice(0, 50),
          gooseEnabled: commandResult.newGooseEnabled
        });
        setChatState(ChatState.Idle);
        return;
      }

      // Build the message list we send to the agent.
      // In collaborative mode, pass the full shared history so the host agent responds with context.
      const MAX_AGENT_CONTEXT_MESSAGES = 200;
      const baseForAgentRawAll =
        Array.isArray(agentContextMessages) && agentContextMessages.length > 0
          ? agentContextMessages
          : messagesRef.current;

      // In collaborative mention-only mode, the agent should primarily reason over the
      // human↔human transcript. Including the agent's own previous "I need context" replies
      // can trap it in a loop where it keeps asking for clarification even though the
      // question exists earlier in the chat.
      const baseForAgentRaw =
        gooseMentionOnly && Array.isArray(agentContextMessages) && agentContextMessages.length > 0
          ? baseForAgentRawAll.filter((m) => (m as any)?.role === 'user')
          : baseForAgentRawAll;
      const baseForAgent =
        baseForAgentRaw.length > MAX_AGENT_CONTEXT_MESSAGES
          ? baseForAgentRaw.slice(-MAX_AGENT_CONTEXT_MESSAGES)
          : baseForAgentRaw;

      // Build the agent payload.
      // We always send the full transcript (Supabase collab history when available), and ensure the
      // final user prompt is unambiguous for the agent.
      const extractText = (m: Message): string => {
        const text =
          Array.isArray((m as any)?.content)
            ? ((m as any).content as any[])
                .filter((c) => c && c.type === 'text')
                .map((c) => c.text || '')
                .join('')
            : '';
        return String(text || '').replace(/\s+/g, ' ').trim();
      };

      const hasSupabaseContext =
        Array.isArray(agentContextMessages) && agentContextMessages.length > 0;

      const rawTriggerText = String(userMessage || '').trim();

      // If Supabase already includes the goose_trigger line, don't add a duplicate local user message
      // with the same text — it can bias the model toward the generic trigger and away from the question.
      const lastBaseText = baseForAgent.length > 0 ? extractText(baseForAgent[baseForAgent.length - 1]) : '';
      const normalizeForCompare = (t: string) =>
        String(t || '')
          .replace(/@goose\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      const lastBaseNorm = normalizeForCompare(lastBaseText);
      const triggerNorm = normalizeForCompare(rawTriggerText);
      const shouldAppendNewUserMsg = !hasSupabaseContext || !(triggerNorm && lastBaseNorm && lastBaseNorm === triggerNorm);

      // No interpretation: the agent sees the full transcript and the *exact* user trigger line.
      const finalPromptText = rawTriggerText;

      const finalUserMsg: Message = {
        ...newUserMsg,
        content: [{ type: 'text', text: finalPromptText }],
      };

      const agentMessages = shouldAppendNewUserMsg
        ? [...baseForAgent, finalUserMsg]
        : [...baseForAgent.slice(0, -1), finalUserMsg];

      // Collaborative sessions: we do NOT rewrite the conversation or the trigger message.
      // However, models can still default to “ask clarifying questions” when the trigger is meta
      // ("what's the answer", "help us here"). Provide a hidden, agent-only instruction so Goose
      // behaves like a participant in the ongoing conversation and answers the current debate.
      //
      // This message is NOT user-visible, but IS agent-visible.
      const collabInvocationInstruction: Message | null =
        gooseMentionOnly && hasSupabaseContext && /@goose\b/i.test(rawTriggerText)
          ? ({
              id: 'agent-only-collab-invoke-v1',
              // Use user role so this instruction is treated as authoritative guidance,
              // but keep it hidden from the UI.
              role: 'user',
              created: Math.floor(Date.now() / 1000),
              // Server-side MessageMetadata is camelCase (userVisible/agentVisible).
              metadata: { userVisible: false, agentVisible: true },
              content: [
                {
                  type: 'text',
                  text:
                    'You are participating in a multi-human chat. When you are invoked with @goose, read the full conversation so far and respond to the ongoing topic. If the invocation message is meta or referential (e.g. "what do you think", "what\'s the answer", "help us here", "who\'s right", "what is it"), treat it as a request to answer the most recent substantive question/disagreement earlier in the chat. Do not ask for clarification if there is a clear preceding question or debate; only ask a clarifying question if there is genuinely no prior topic/question to answer.',
                },
              ],
            } as Message)
          : null;

      const agentMessagesForSend = collabInvocationInstruction
        ? [collabInvocationInstruction, ...agentMessages]
        : agentMessages;

      // If explicitly enabled, dump the *exact* payload text being sent to Goose.
      // This is intentionally gated because it can be large and may contain sensitive content.
      const dumpAgentPayload =
        typeof window !== 'undefined' &&
        (window as any)?.localStorage?.getItem('GOOSE_DEBUG_DUMP_AGENT_PAYLOAD') === '1';
      if (dumpAgentPayload) {
        const payload = {
          sessionId,
          contextSource,
          // This is exactly what we send to /reply (minus auth headers).
          messages: agentMessagesForSend,
        };
        try {
          const json = JSON.stringify(payload, null, 2);
          console.log('GOOSE_DEBUG_AGENT_PAYLOAD_JSON', json);
          // Write to disk so users can inspect/copy exactly what Goose received.
          // Use a stable path and overwrite each time to avoid unbounded growth.
          const outPath = '.cursor/goose-agent-payload.json';
          window.electron
            ?.ensureDirectory?.('.cursor')
            .catch(() => {})
            .finally(() => {
              window.electron?.writeFile?.(outPath, json).catch(() => {});
            });
        } catch (e) {
          console.error('Failed to dump agent payload', e);
        }
      }

      // Debug: ensure we are sending full shared context (especially important for collab host triggers).
      log.stream('reply-payload', {
        agentContextProvided: Array.isArray(agentContextMessages) ? agentContextMessages.length : 0,
        messagesRefCount: messagesRef.current.length,
        agentMessagesCount: agentMessagesForSend.length,
        lastTextForAgentPreview: (() => {
          const last = agentMessagesForSend[agentMessagesForSend.length - 1];
          const text =
            Array.isArray(last?.content)
              ? (last.content as any[])
                  .filter((c) => c && c.type === 'text')
                  .map((c) => c.text || '')
                  .join('')
              : '';
          return text.slice(0, 120);
        })(),
      });

      // Explicit context snapshot for debugging: show exactly what the agent is conditioned on.
      // This is intentionally compact (last N messages, truncated text) to avoid huge logs.
      const contextSource =
        Array.isArray(agentContextMessages) && agentContextMessages.length > 0 ? 'supabase' : 'local';
      const toTextPreview = (m: Message): string => {
        const text =
          Array.isArray((m as any)?.content)
            ? ((m as any).content as any[])
                .filter((c) => c && c.type === 'text')
                .map((c) => c.text || '')
                .join('')
            : '';
        return String(text || '').replace(/\s+/g, ' ').trim();
      };
      const contextTail = agentMessagesForSend
        .slice(Math.max(0, agentMessagesForSend.length - 8))
        .map((m) => ({
          role: (m as any)?.role,
          id: (m as any)?.id ? String((m as any).id).slice(0, 12) : null,
          text: toTextPreview(m).slice(0, 120),
        }));
      // Make this extremely easy to find in DevTools (users can Cmd+F for AGENT_CONTEXT_SNAPSHOT).
      console.log('AGENT_CONTEXT_SNAPSHOT', {
        sessionId,
        contextSource,
        agentContextCount: Array.isArray(agentContextMessages) ? agentContextMessages.length : 0,
        agentMessagesCount: agentMessagesForSend.length,
        finalPromptTextPreview: finalPromptText ? finalPromptText.slice(0, 120) : '',
        replacedFinalPrompt: false,
        shouldAppendNewUserMsg,
        tail: contextTail,
      });
      console.log(
        'AGENT_CONTEXT_TAIL\n' +
          contextTail
            .map((m) => `[${m.role}] ${m.text}`)
            .join('\n')
      );
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'ctx-pre',hypothesisId:'CTX',location:'useChatStream.ts:handleSubmit',message:'agent-context-snapshot',data:{gooseSessionId:String(sessionId).slice(0,12),contextSource,agentContextCount:Array.isArray(agentContextMessages)?agentContextMessages.length:0,agentMessagesCount:agentMessagesForSend.length,finalPromptTextPreview:finalPromptText?finalPromptText.slice(0,120):'',replacedFinalPrompt:false,shouldAppendNewUserMsg,tail:contextTail},timestamp:Date.now()})}).catch(()=>{});
      // #endregion agent log

      // If the last user message is empty, don't hit the agent.
      const lastForAgent = agentMessagesForSend[agentMessagesForSend.length - 1];
      const lastTextForAgent =
        Array.isArray(lastForAgent?.content)
          ? lastForAgent.content
              .filter((c) => c && c.type === 'text')
              .map((c: any) => c.text || '')
              .join('')
              .trim()
          : '';
      if (!lastTextForAgent) {
        log.messages('skipping-ai-empty-message', currentMessages.length, { note: 'empty message' });
        setChatState(ChatState.Idle);
        return;
      }

      log.state(ChatState.Streaming, { reason: 'user submit' });
      setChatState(ChatState.Streaming);

      abortControllerRef.current = new AbortController();

      try {
        log.stream('request-start', { sessionId: sessionId.slice(0, 8) });

        // Check if client is configured before making API calls
        const config = client.getConfig();
        if (!config.baseUrl) {
          log.error('client not configured during submit', { config });
          throw new Error('API client not configured. Please refresh the page.');
        }

        // Ensure we have a valid session before sending the message
        let currentSession = session;
        if (!currentSession) {
          // Check if session creation is already in progress for this sessionId
          if (sessionCreationInProgress.has(sessionId)) {
            log.session('session-creation-already-in-progress', sessionId);
            throw new Error('Session creation already in progress. Please wait a moment and try again.');
          }

          log.session('creating-session-for-message', sessionId);
          sessionCreationInProgress.add(sessionId);
          
          try {
            // Add a small delay to prevent rapid session creation conflicts
            await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100));
            
            const createResponse = await client.post({
              url: '/agent/start',
              body: {
                working_dir: window.appConfig?.get('GOOSE_WORKING_DIR') as string || process.cwd(),
              },
              throwOnError: true,
            });
            
            currentSession = createResponse.data as Session;
            if (!currentSession) {
              throw new Error('Session creation returned empty response');
            }
            setSession(currentSession);
            log.session('session-created-for-message', currentSession.id, {
              originalSessionId: sessionId,
              actualSessionId: currentSession.id,
            });

            // Notify parent component that session ID has changed
            if (onSessionIdChange && currentSession.id !== sessionId) {
              log.session('notifying-session-id-change', currentSession.id, {
                from: sessionId,
                to: currentSession.id,
              });
              onSessionIdChange(currentSession.id);
            }
          } catch (createError) {
            log.error('failed-to-create-session-for-message', createError);
            
            // Check if it's a port conflict error
            if (createError instanceof Error && createError.message.includes('Address already in use')) {
              throw new Error('Server port conflict - please restart the development server');
            }
            
            throw new Error('Failed to create session: ' + (createError instanceof Error ? createError.message : String(createError)));
          } finally {
            // Always remove from tracking set
            sessionCreationInProgress.delete(sessionId);
          }
        }

        // At this point currentSession must be defined (either from state or created above)
        if (!currentSession) {
          throw new Error('Session is unexpectedly undefined');
        }

        // Get the configured base URL and headers from the API client
        const baseUrl = config.baseUrl || '';
        const apiUrl = `${baseUrl}/reply`;

        // Get and log the secret key for debugging
        const secretKey = await window.electron.getSecretKey();
        log.stream('auth-debug', { 
          baseUrl, 
          apiUrl, 
          hasSecretKey: !!secretKey,
          secretKeyLength: secretKey?.length || 0,
          configHeaders: Object.keys(config.headers || {}),
          sessionId: currentSession.id.slice(0, 8)
        });

        // Make a direct fetch call to handle SSE streaming
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': secretKey,
            ...config.headers,
          },
          body: JSON.stringify({
            messages: agentMessagesForSend,
            session_id: currentSession.id, // Use the actual session ID from the backend
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          log.error('http-error', { 
            status: response.status, 
            statusText: response.statusText, 
            errorText: errorText.slice(0, 200) 
          });
          
          if (response.status === 401) {
            throw new Error(`Authentication failed (401): Invalid or missing secret key. ${errorText}`);
          }
          
          throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }

        log.stream('stream-started');

        // Parse the SSE stream from the response
        const stream = parseSSEStreamFromResponse(response);

        await streamFromResponse(
          stream,
          currentMessages,
          (messages: Message[]) => setMessagesAndLog(messages, 'streaming'),
          setTokenState,
          setChatState,
          onFinish
        );

        log.stream('stream-complete');
      } catch (error) {
        // AbortError is expected when user stops streaming
        if (error instanceof Error && error.name === 'AbortError') {
          log.stream('stream-aborted');
        } else {
          // Check for backend unavailable errors
          if (error && typeof error === 'object' && 'status' in error && (error.status === 404 || error.status === 0)) {
            log.error('backend unavailable during submit', error);
            
            // Add a mock response for UI testing
            const mockResponse: Message = {
              id: `mock-${Date.now()}`,
              role: 'assistant',
              content: [{
                type: 'text',
                text: '🔌 **Backend Unavailable**\n\nThe goose server is not running. To use the chat functionality:\n\n1. Start the goose server\n2. Ensure it\'s running on the correct port\n3. Try your message again\n\nFor now, you can still test the tabbed interface!'
              }],
              created: Math.floor(Date.now() / 1000),
            };
            
            const updatedMessages = [...currentMessages, mockResponse];
            setMessagesAndLog(updatedMessages, 'mock-response');
            onFinish();
          } else {
            // Other unexpected errors
            log.error('submit failed', error);
            onFinish('Submit error: ' + (error instanceof Error ? error.message : String(error)));
          }
        }
      }
    },
    [sessionId, session, gooseEnabled, gooseMentionOnly, agentContextMessages, setMessagesAndLog, onFinish, onSessionIdChange]
  );

  const setRecipeUserParams = useCallback(
    async (user_recipe_values: Record<string, string>) => {
      if (session) {
        // TODO: Implement updateSessionUserRecipeValues API endpoint
        console.warn('setRecipeUserParams: API endpoint not implemented yet', user_recipe_values);
        
        // Temporary workaround: just update local state
        setSession({
          ...session,
          user_recipe_values,
        } as any); // Type assertion needed since user_recipe_values doesn't exist on Session type yet
      } else {
        setSessionLoadError("can't call setRecipeParams without a session");
      }
    },
    [sessionId, session, setSessionLoadError]
  );

  useEffect(() => {
    // Session sync with server - this functionality may need to be implemented
    // when proper session management is required. For now, basic session loading
    // via resumeAgent is sufficient for the tabbed chat interface.
    if (session) {
      log.session('session-loaded', session.id, {
        description: session.description,
        messageCount: session.conversation?.length || 0,
      });
    }
  }, [session]);

  useEffect(() => {
    if (initialMessage && session && messages.length === 0 && chatState === ChatState.Idle) {
      log.messages('auto-submit-initial', 0, { initialMessage: initialMessage.slice(0, 50) });
      handleSubmit(initialMessage);
    }
  }, [initialMessage, session, messages.length, chatState, handleSubmit]);

  const stopStreaming = useCallback(() => {
    log.stream('stop-requested');
    abortControllerRef.current?.abort();
    log.state(ChatState.Idle, { reason: 'user stopped streaming' });
    setChatState(ChatState.Idle);
  }, []);

  // Listen for Matrix messages from BaseChat2's append function - ONLY FOR MATRIX TABS
  useEffect(() => {
    // CRITICAL SECURITY: Only Matrix tabs should listen for Matrix messages
    // This prevents Matrix messages from appearing in non-Matrix tabs
    if (!isMatrixTab) {
      console.log('🚫 useChatStream: Not a Matrix tab, skipping Matrix message listener setup:', {
        sessionId: sessionId.substring(0, 8),
        isMatrixTab
      });
      return;
    }

    console.log('✅ useChatStream: Setting up Matrix message listener for Matrix tab:', {
      sessionId: sessionId.substring(0, 8),
      isMatrixTab
    });

    const handleMatrixMessage = (event: CustomEvent) => {
      const { message, targetSessionId, timestamp } = event.detail;
      
      // CRITICAL: Only process messages intended for THIS specific session
      if (targetSessionId !== sessionId) {
        console.log('🚫 useChatStream ignoring matrix message for different session:', {
          eventTargetSessionId: targetSessionId?.substring(0, 8),
          thisSessionId: sessionId.substring(0, 8),
          messageId: message.id,
          sender: message.sender?.displayName || message.sender?.userId || 'unknown'
        });
        return;
      }
      
      console.log('✅ useChatStream received SESSION-SPECIFIC matrix-message-received event (MATRIX TAB ONLY):', {
        sessionId: sessionId.substring(0, 8),
        messageId: message.id,
        role: message.role,
        sender: message.sender?.displayName || message.sender?.userId || 'unknown',
        content: Array.isArray(message.content) ? message.content[0]?.text?.substring(0, 50) + '...' : 'N/A',
        timestamp,
        isMatrixTab
      });
      
      // Add the Matrix message to our current messages
      const currentMessages = [...messagesRef.current, message];
      setMessagesAndLog(currentMessages, 'matrix-message-added');
      
      console.log('✅ Matrix message added to stream for Matrix tab:', {
        sessionId: sessionId.substring(0, 8),
        totalMessages: currentMessages.length,
        messageId: message.id
      });
    };

    // Type assertion to handle the mismatch between CustomEvent and EventListener
    const eventListener = handleMatrixMessage as (event: globalThis.Event) => void;
    window.addEventListener('matrix-message-received', eventListener);

    return () => {
      window.removeEventListener('matrix-message-received', eventListener);
      console.log('🧹 useChatStream: Cleaned up Matrix message listener for Matrix tab:', {
        sessionId: sessionId.substring(0, 8),
        isMatrixTab
      });
    };
  }, [setMessagesAndLog, sessionId, isMatrixTab]); // IMPORTANT: Include isMatrixTab in dependencies

  const cached = resultsCache.get(sessionId);
  
  // CRITICAL FIX: Only use cache if it's for the EXACT same session ID
  // and we don't have current messages loaded yet
  const shouldUseCachedMessages = cached && 
    cached.session.id === sessionId && 
    messages.length === 0 && 
    !session;
    
  const finalMessages = shouldUseCachedMessages ? cached.messages : messages;
  const finalSession = session ?? (shouldUseCachedMessages ? cached.session : undefined);

  console.log('>> returning', sessionId, Date.now(), {
    messagesLength: finalMessages.length,
    hasSession: !!finalSession,
    chatState,
    cached: !!cached,
    cachedMessageCount: cached?.messages?.length || 0,
    shouldUseCachedMessages,
    sessionMatch: cached?.session.id === sessionId,
    currentSessionId: session?.id,
    cachedSessionId: cached?.session.id
  });

  return {
    sessionLoadError,
    messages: finalMessages,
    session: finalSession,
    chatState,
    handleSubmit,
    stopStreaming,
    setRecipeUserParams,
    tokenState,
    gooseEnabled,
  };
}
