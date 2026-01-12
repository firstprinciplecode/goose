import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Tab, TabSidecarState, TabSidecarView } from '../components/TabBar';
import { ChatType } from '../types/chat';
import { generateSessionId } from '../utils/sessionUtils';
import { getSession, updateSessionDescription, startAgent, deleteSession, Session } from '../api';
import { sessionMappingService } from '../services/SessionMappingService';
import { matrixService } from '../services/MatrixService';
import { useSupabase } from './SupabaseContext';
import {
  getSessionByGooseId,
  migrateCollaborativeSessionGooseSessionId,
} from '../services/collaborativeSessionService';
import { unifiedSessionService } from '../services/UnifiedSessionService';
import { matrixSessionService } from '../services/MatrixSessionService';

interface TabState {
  tab: Tab;
  chat: ChatType;
  loadingChat: boolean;
}

interface TabContextType {
  tabStates: TabState[];
  activeTabId: string;
  setActiveTabId: (tabId: string) => void;
  handleTabClick: (tabId: string) => void;
  handleTabClose: (tabId: string) => void;
  handleNewTab: () => void;
  createChatTab: (overrides?: { title?: string; isCollaborativeJoin?: boolean }) => Promise<{ tabId: string; sessionId: string } | null>;
  handleChatUpdate: (tabId: string, chat: ChatType) => void;
  handleMessageSubmit: (message: string, tabId: string) => void;
  getActiveTabState: () => TabState | undefined;
  restoreTabState: () => void;
  clearTabState: () => void;
  syncTabTitleWithBackend: (tabId: string) => Promise<void>;
  updateTabTitleFromMessage: (tabId: string, message: string | any) => Promise<void>;
  openExistingSession: (sessionId: string, title?: string, isCollaborativeJoin?: boolean, session?: Session) => Promise<{ success: boolean; session?: Session; error?: string }>;
  updateSessionId: (tabId: string, newSessionId: string) => void;
  // Tab title update (without touching messages)
  updateTabTitle: (tabId: string, title: string) => void;
  // Collaborative session methods
  setTabCollaborative: (tabId: string, isCollaborative: boolean) => void;
  // Matrix-specific methods
  openMatrixChat: (roomId: string, senderId: string, roomName?: string) => void;
  morphTabToMatrix: (tabId: string, roomId: string, recipientId: string, roomTitle?: string) => Promise<void>;
  createBackendSession: (tabId: string) => Promise<string>;
  // Sidecar management functions
  showSidecarView: (tabId: string, view: TabSidecarView) => void;
  hideSidecarView: (tabId: string, viewId: string) => void;
  hideAllSidecarViews: (tabId: string) => void;
  getSidecarState: (tabId: string) => TabSidecarState | undefined;
  showDiffViewer: (tabId: string, diffContent: string, fileName?: string, instanceId?: string) => void;
  showLocalhostViewer: (tabId: string, url?: string, title?: string, instanceId?: string) => void;
  showWebViewer: (tabId: string, url?: string, title?: string, instanceId?: string) => void;
  showFileViewer: (tabId: string, filePath: string, instanceId?: string) => void;
  showDocumentEditor: (tabId: string, filePath?: string, initialContent?: string, instanceId?: string) => void;
}

const TabContext = createContext<TabContextType | undefined>(undefined);

const TAB_STATE_STORAGE_KEY = 'goose-tab-state';
const MAX_RESTORED_TABS = 3;

function trimRestoredTabStates(raw: any[], maxTabs: number): any[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  // Filter obviously invalid entries
  const onlyValid = raw.filter((ts) => ts?.tab?.id);
  if (onlyValid.length <= maxTabs) return onlyValid;

  // De-dupe by tab.id, keeping the last occurrence (closest to "most recent" in storage order)
  const byId = new Map<string, any>();
  for (const ts of onlyValid) {
    byId.set(ts.tab.id, ts);
  }
  const deduped = Array.from(byId.values());

  // Identify active tab (fallback to last)
  const active = deduped.find((ts) => ts.tab?.isActive) ?? deduped[deduped.length - 1];
  const activeId = active?.tab?.id;

  // Keep the last N entries in storage order
  let trimmed = deduped.slice(-maxTabs);

  // Ensure the active tab is included
  if (activeId && !trimmed.some((ts) => ts.tab?.id === activeId)) {
    trimmed = [active, ...trimmed].slice(0, maxTabs);
  }

  // Normalize active flags (exactly one active)
  trimmed = trimmed.map((ts) => ({
    ...ts,
    tab: { ...ts.tab, isActive: ts.tab?.id === activeId },
  }));

  return trimmed;
}

const createNewTab = (overrides: Partial<Tab> = {}): Tab => {
  // Generate a truly unique tab ID
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  
  // For new tabs, we'll create the backend session immediately
  // The sessionId will be set after the backend session is created
  return {
    id: `tab-${timestamp}-${random}`,
    title: 'New Chat',
    type: 'chat',
    sessionId: '', // Will be set immediately after creation
    isActive: false,
    hasUnsavedChanges: false,
    ...overrides
  };
};

const createNewChat = (sessionId: string, options?: { recipeConfig?: any; aiEnabled?: boolean }): ChatType => ({
  sessionId,
  title: 'New Chat',
  messages: [],
  messageHistoryIndex: 0,
  recipeConfig: options?.recipeConfig || null, // EXPLICIT: Only set recipe if explicitly provided
  aiEnabled: options?.aiEnabled ?? true, // Default to true for regular chats
});

const createInitialTabState = (): TabState[] => {
  // Start with a temporary session - we'll create the backend session after component mounts
  const firstTab = createNewTab({ sessionId: `temp_initial_${Date.now()}`, isActive: true });
  return [{
    tab: firstTab,
    chat: createNewChat(firstTab.sessionId),
    loadingChat: false
  }];
};

interface TabProviderProps {
  children: ReactNode;
}

export const TabProvider: React.FC<TabProviderProps> = ({ children }) => {
  const [tabStates, setTabStates] = useState<TabState[]>(() => {
    // Try to restore from localStorage on initial load
    try {
      const saved = localStorage.getItem(TAB_STATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const limited = trimRestoredTabStates(parsed, MAX_RESTORED_TABS);

          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'tab-pre',hypothesisId:'H1',location:'TabContext.tsx:restore',message:'restore-from-localStorage',data:{savedCount:Array.isArray(parsed)?parsed.length:null,limitedCount:limited.length,ids:limited.map((t:any)=>String(t?.tab?.id||'').slice(0,18)),sessionIds:limited.map((t:any)=>String(t?.tab?.sessionId||'').slice(0,18)),actives:limited.map((t:any)=>!!t?.tab?.isActive)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion agent log

          // Restore tabs as-is (bounded + validated). We should NOT rewrite backend session IDs here,
          // otherwise history resume becomes flaky and auto-open heuristics misfire.
          const sanitizedTabs = limited.map((tabState: any) => {
            const tab = tabState.tab;
            
            // Validate Matrix tab properties (HYBRID APPROACH)
            if (tab.type === 'matrix') {
              // Matrix tabs must have matrixRoomId - sessionId can be any backend session ID
              if (!tab.matrixRoomId) {
                console.warn('🚨 Invalid Matrix tab detected during restore (missing matrixRoomId), converting to regular chat:', tab);
                return {
                  ...tabState,
                  tab: {
                    ...tab,
                    type: 'chat',
                    matrixRoomId: undefined,
                    matrixRecipientId: undefined,
                    // Keep sessionId as-is; if it's invalid, backend resume will fail gracefully.
                  },
                  chat: {
                    ...tabState.chat,
                    sessionId: tab.sessionId,
                  }
                };
              } else {
                // Valid Matrix tab - keep its session id
                return {
                  ...tabState,
                  tab: {
                    ...tab,
                  },
                  chat: {
                    ...tabState.chat,
                    sessionId: tab.sessionId,
                  }
                };
              }
            } else {
              // Regular chat tabs must NOT have Matrix properties
              if (tab.matrixRoomId || tab.matrixRecipientId) {
                console.warn('🚨 Regular chat tab with Matrix properties detected during restore, sanitizing:', tab);
                return {
                  ...tabState,
                  tab: {
                    ...tab,
                    type: 'chat',
                    matrixRoomId: undefined,
                    matrixRecipientId: undefined,
                    // Keep sessionId as-is
                  },
                  chat: {
                    ...tabState.chat,
                    sessionId: tab.sessionId,
                  }
                };
              } else {
                // Valid regular tab - keep as-is
                return tabState;
              }
            }
          });
          
          console.log('🔄 Restored and sanitized tab states with unique session IDs:', sanitizedTabs.map(ts => ({
            id: ts.tab.id,
            type: ts.tab.type,
            sessionId: ts.tab.sessionId,
            matrixRoomId: ts.tab.matrixRoomId,
            title: ts.tab.title
          })));

          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/0a2a2409-8cfb-47ff-93e1-46a51d405d03',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'tab-pre',hypothesisId:'H1',location:'TabContext.tsx:restore',message:'restore-sanitized',data:{sanitizedCount:sanitizedTabs.length,sanitizedSessionIds:sanitizedTabs.map((t:any)=>String(t?.tab?.sessionId||'').slice(0,24)),titles:sanitizedTabs.map((t:any)=>String(t?.tab?.title||'').slice(0,40)),actives:sanitizedTabs.map((t:any)=>!!t?.tab?.isActive)},timestamp:Date.now()})}).catch(()=>{});
          // #endregion agent log
          
          return sanitizedTabs;
        }
      }
    } catch (error) {
      console.warn('Failed to restore tab state from localStorage:', error);
    }
    return createInitialTabState();
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    const activeTab = tabStates.find(ts => ts.tab.isActive);
    return activeTab?.tab.id || tabStates[0]?.tab.id || '';
  });

  const { client: supabaseClient, isEnabled: supabaseEnabled } = useSupabase();

  // Save tab state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(TAB_STATE_STORAGE_KEY, JSON.stringify(tabStates));
    } catch (error) {
      console.warn('Failed to save tab state to localStorage:', error);
    }
  }, [tabStates]);

  // Update active states when activeTabId changes
  useEffect(() => {
    setTabStates(prev => prev.map(ts => ({
      ...ts,
      tab: { ...ts.tab, isActive: ts.tab.id === activeTabId }
    })));
  }, [activeTabId]);

  // Create backend sessions for any temporary sessions after component mounts
  useEffect(() => {
    const createBackendSessionsForTempTabs = async () => {
      const tempTabs = tabStates.filter(ts => ts.tab.sessionId.startsWith('temp_'));
      
      for (const tabState of tempTabs) {
        try {
          console.log('🔄 Converting temporary session to backend session:', tabState.tab.sessionId);
          await createBackendSession(tabState.tab.id);
        } catch (error) {
          console.error('❌ Failed to create backend session for temp tab:', tabState.tab.id, error);
        }
      }
    };

    // Only run this once after initial mount, with a small delay to ensure everything is initialized
    const timeoutId = setTimeout(createBackendSessionsForTempTabs, 1000);
    
    return () => clearTimeout(timeoutId);
  }, []); // Empty dependency array - only run once on mount

  const handleTabClick = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, [activeTabId]);

  const createChatTab = useCallback(async (overrides?: { title?: string; isCollaborativeJoin?: boolean }): Promise<{ tabId: string; sessionId: string } | null> => {
    try {
      const response = await startAgent({
        body: {
          working_dir: window.appConfig.get('GOOSE_WORKING_DIR') as string,
        }
      });

      if (!response.data?.id) {
        throw new Error('Failed to create backend session - no session ID returned');
      }

      const sessionId = response.data.id;
      const newTab = createNewTab({
        sessionId,
        title: overrides?.title ?? 'New Chat',
        isCollaborativeJoin: overrides?.isCollaborativeJoin ?? false,
      });
      const newTabState: TabState = {
        tab: newTab,
        chat: createNewChat(sessionId),
        loadingChat: false
      };

      setTabStates(prev => [...prev, newTabState]);
      setActiveTabId(newTab.id);
      return { tabId: newTab.id, sessionId };
    } catch (error) {
      console.error('❌ Failed to create chat tab:', error);
      return null;
    }
  }, []);

  const handleNewTab = useCallback(async () => {
    try {
      console.log('🆕 Creating new tab with immediate backend session');
      console.log('🆕 Current tab states before creating new tab:', tabStates.map(ts => ({
        tabId: ts.tab.id,
        sessionId: ts.tab.sessionId,
        title: ts.tab.title
      })));
      
      // Create a new backend session immediately using startAgent
      const response = await startAgent({
        body: {
          working_dir: window.appConfig.get('GOOSE_WORKING_DIR') as string,
        }
      });

      if (!response.data?.id) {
        throw new Error('Failed to create backend session - no session ID returned');
      }

      const sessionId = response.data.id;
      console.log('✅ Created backend session for new tab:', sessionId);

      // Create the tab with the real backend session ID
      const newTab = createNewTab({ sessionId });
      const newTabState: TabState = {
        tab: newTab,
        chat: createNewChat(sessionId),
        loadingChat: false
      };
      
      setTabStates(prev => {
        const updatedStates = [...prev, newTabState];
        console.log('🆕 Updated tab states after adding new tab:', updatedStates.map(ts => ({
          tabId: ts.tab.id,
          sessionId: ts.tab.sessionId,
          title: ts.tab.title,
          isActive: ts.tab.isActive
        })));
        return updatedStates;
      });
      setActiveTabId(newTab.id);
      
      console.log('✅ New tab created successfully:', { 
        tabId: newTab.id, 
        sessionId,
        uniqueSessionIds: [...new Set([...tabStates.map(ts => ts.tab.sessionId), sessionId])].length,
        totalTabs: tabStates.length + 1
      });
    } catch (error) {
      console.error('❌ Failed to create new tab with backend session:', error);
      
      // Fallback: create tab with temporary session ID and try to create backend session later
      const tempSessionId = `temp_${Date.now()}`;
      const newTab = createNewTab({ sessionId: tempSessionId });
      const newTabState: TabState = {
        tab: newTab,
        chat: createNewChat(newTab.sessionId),
        loadingChat: false
      };
      
      console.log('🆕 Creating fallback tab with temp session:', {
        tabId: newTab.id,
        tempSessionId,
        currentTabCount: tabStates.length
      });
      
      setTabStates(prev => [...prev, newTabState]);
      setActiveTabId(newTab.id);
      
      // Try to create backend session in the background
      setTimeout(async () => {
        try {
          const backendSessionId = await createBackendSession(newTab.id);
          console.log('✅ Successfully created backend session for fallback tab:', backendSessionId);
        } catch (bgError) {
          console.error('❌ Failed to create backend session in background:', bgError);
        }
      }, 1000);
    }
  }, [tabStates]);

  const handleTabClose = useCallback(async (tabId: string) => {
    // Get the tab being closed for cleanup logic
    const closingTab = tabStates.find(ts => ts.tab.id === tabId);
    
    // Perform session cleanup if needed
    if (closingTab) {
      console.log('🗑️ Closing tab:', { tabId, sessionId: closingTab.tab.sessionId, hasMessages: closingTab.chat.messages.length > 0 });
      
      // Check if the session should be cleaned up (empty sessions only)
      const shouldCleanupSession = closingTab.chat.messages.length === 0 && 
                                  closingTab.tab.sessionId && 
                                  !closingTab.tab.sessionId.startsWith('temp_') &&
                                  !closingTab.tab.sessionId.startsWith('new_');
      
      if (shouldCleanupSession) {
        try {
          console.log('🧹 Cleaning up empty session:', closingTab.tab.sessionId);
          await deleteSession({
            path: { session_id: closingTab.tab.sessionId }
          });
          console.log('✅ Successfully deleted empty session:', closingTab.tab.sessionId);
        } catch (error) {
          console.warn('⚠️ Failed to delete empty session (may not exist):', closingTab.tab.sessionId, error);
          // Don't block tab closing if session deletion fails
        }
      } else if (closingTab.chat.messages.length > 0) {
        console.log('💾 Preserving session with messages:', closingTab.tab.sessionId);
      } else {
        console.log('⏭️ Skipping cleanup for temporary/new session:', closingTab.tab.sessionId);
      }
    }

    // Update tab states (and active tab) atomically.
    // IMPORTANT: use functional updates so a "close tab" can't override a new active tab
    // that was set by a subsequent "+" click.
    setTabStates((prev) => {
      // Prevent closing the last tab (use latest state, not captured closure).
      if (prev.length === 1) {
        console.log('🚫 Cannot close the last tab');
        return prev;
      }

      const newStates = prev.filter((ts) => ts.tab.id !== tabId);

      // If we closed the active tab, pick a neighbor, but only if the active tab
      // is STILL the one being closed (avoid races with handleNewTab).
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) return currentActive;
        if (newStates.length === 0) return currentActive;
        const tabIndex = prev.findIndex((ts) => ts.tab.id === tabId);
        const nextActiveIndex = Math.min(tabIndex, newStates.length - 1);
        return newStates[nextActiveIndex].tab.id;
      });

      return newStates;
    });
  }, [tabStates]);

  const handleChatUpdate = useCallback((tabId: string, chat: ChatType) => {
    setTabStates(prev => prev.map(ts => 
      ts.tab.id === tabId 
        ? { 
            ...ts, 
            chat,
            tab: {
              ...ts.tab,
              title: chat.title || ts.tab.title,
              hasUnsavedChanges: chat.messages.length > 0,
              recipeTitle: chat.recipeConfig?.title
            }
          }
        : ts
    ));

    // If the chat has a title and the tab doesn't, update the tab title
    if (chat.title && chat.title !== 'New Chat') {
      const tabState = tabStates.find(ts => ts.tab.id === tabId);
      if (tabState && tabState.tab.title === 'New Chat') {
        console.log('🏷️ Updating tab title from chat update:', chat.title);
        setTabStates(prev => prev.map(ts => 
          ts.tab.id === tabId 
            ? { 
                ...ts, 
                tab: { ...ts.tab, title: chat.title }
              }
            : ts
        ));
      }
    }
  }, [tabStates]);

  const handleMessageSubmit = useCallback((message: string, tabId: string) => {
    // Mark tab as having unsaved changes
    setTabStates(prev => prev.map(ts => 
      ts.tab.id === tabId 
        ? { ...ts, tab: { ...ts.tab, hasUnsavedChanges: true } }
        : ts
    ));
  }, []);

  const getActiveTabState = useCallback(() => {
    return tabStates.find(ts => ts.tab.id === activeTabId);
  }, [tabStates, activeTabId]);

  const restoreTabState = useCallback(() => {
    try {
      const saved = localStorage.getItem(TAB_STATE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const limited = trimRestoredTabStates(parsed, MAX_RESTORED_TABS);

          // Apply the same sanitization logic as in initial load
          const sanitizedTabs = limited.map((tabState: any) => {
            const tab = tabState.tab;
            
            // Validate Matrix tab properties (HYBRID APPROACH)
            if (tab.type === 'matrix') {
              // Matrix tabs must have matrixRoomId - sessionId can be any backend session ID
              if (!tab.matrixRoomId) {
                console.warn('🚨 Invalid Matrix tab detected during manual restore (missing matrixRoomId), converting to regular chat:', tab);
                return {
                  ...tabState,
                  tab: {
                    ...tab,
                    type: 'chat',
                    matrixRoomId: undefined,
                    matrixRecipientId: undefined,
                    // Keep the sessionId as-is since it's a valid backend session ID
                  }
                };
              }
            } else {
              // Regular chat tabs must NOT have Matrix properties
              if (tab.matrixRoomId || tab.matrixRecipientId) {
                console.warn('🚨 Regular chat tab with Matrix properties detected during manual restore, sanitizing:', tab);
                return {
                  ...tabState,
                  tab: {
                    ...tab,
                    type: 'chat',
                    matrixRoomId: undefined,
                    matrixRecipientId: undefined,
                    // Keep the sessionId as-is - it might be a valid backend session ID
                  }
                };
              }
            }
            
            return tabState;
          });
          
          setTabStates(sanitizedTabs);
          const activeTab = sanitizedTabs.find((ts: TabState) => ts.tab.isActive);
          if (activeTab) {
            setActiveTabId(activeTab.tab.id);
          }
          return;
        }
      }
    } catch (error) {
      console.warn('Failed to restore tab state:', error);
    }
    
    // Fallback to initial state if restore fails
    const initialState = createInitialTabState();
    setTabStates(initialState);
    setActiveTabId(initialState[0].tab.id);
  }, []);

  const clearTabState = useCallback(() => {
    try {
      localStorage.removeItem(TAB_STATE_STORAGE_KEY);
      console.log('🧹 Cleared tab state from localStorage to prevent session ID conflicts');
    } catch (error) {
      console.warn('Failed to clear tab state from localStorage:', error);
    }
    
    const initialState = createInitialTabState();
    setTabStates(initialState);
    setActiveTabId(initialState[0].tab.id);
  }, []);



  // Sync tab title with backend session description
  const syncTabTitleWithBackend = useCallback(async (tabId: string) => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (!tabState) return;

    // Don't try to sync new sessions that don't exist on the backend yet
    if (tabState.tab.sessionId.startsWith('new_')) {
      console.log('🏷️ Skipping backend sync for new session:', tabState.tab.sessionId);
      return;
    }

    try {
      console.log('🏷️ Syncing tab title with backend for session:', tabState.tab.sessionId);
      const response = await getSession({
        path: { session_id: tabState.tab.sessionId }
      });

      if (response.data) {
        const backendTitle = response.data.description;
        console.log('🏷️ Backend session data:', {
          sessionId: tabState.tab.sessionId,
          description: backendTitle,
          messageCount: response.data.message_count
        });
        
        // Only update if we got a meaningful title from the backend
        if (backendTitle && backendTitle.trim() && backendTitle !== 'New Chat') {
          console.log('🏷️ Updating tab title from backend:', backendTitle);
          setTabStates(prev => prev.map(ts => 
            ts.tab.id === tabId 
              ? { 
                  ...ts, 
                  tab: { ...ts.tab, title: backendTitle },
                  chat: { ...ts.chat, title: backendTitle }
                }
              : ts
          ));
        } else {
          console.log('🏷️ No meaningful title found in backend, keeping current title');
        }
      }
    } catch (error) {
      console.warn('Failed to sync tab title with backend for session:', tabState.tab.sessionId, error);
      // Don't throw - this is a nice-to-have feature
    }
  }, [tabStates]);

  // Update tab title from first message and sync with backend
  const updateTabTitleFromMessage = useCallback(async (tabId: string, message: string | any) => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (!tabState) return;

    // Ensure message is a string and handle different input types
    let messageText: string;
    if (typeof message === 'string') {
      messageText = message;
    } else if (message && typeof message === 'object') {
      // Handle Matrix message objects or other structured messages
      messageText = message.text || message.content || message.body || String(message);
    } else {
      messageText = String(message || '');
    }

    // Generate a meaningful title from the message
    let newTitle = messageText.trim();
    
    // Truncate long messages
    if (newTitle.length > 50) {
      newTitle = newTitle.substring(0, 47) + '...';
    }
    
    // Fallback for empty or very short messages
    if (newTitle.length < 3) {
      newTitle = `Chat ${new Date().toLocaleTimeString()}`;
    }

    console.log('🏷️ Updating tab title from message:', newTitle);

    // Update local state immediately for responsive UI
    setTabStates(prev => prev.map(ts => 
      ts.tab.id === tabId 
        ? { 
            ...ts, 
            tab: { ...ts.tab, title: newTitle },
            chat: { ...ts.chat, title: newTitle }
          }
        : ts
    ));

    // Sync with backend (async, don't wait)
    try {
      await updateSessionDescription({
        path: { session_id: tabState.tab.sessionId },
        body: { description: newTitle }
      });
      console.log('🏷️ Successfully updated backend session description');
    } catch (error) {
      console.warn('Failed to update backend session description:', error);
      // Don't throw - local title update is more important
    }
  }, [tabStates]);

  // Helper function to check if folder matches and fetch session if needed
  const checkFolderMatch = useCallback(async (sessionId: string, providedSession?: Session): Promise<{ match: boolean; session: Session | null; error?: 'SESSION_NOT_FOUND' }> => {
    // Skip folder check for Matrix sessions (they have special working_dir like "Direct Message")
    if (matrixSessionService.isMatrixSession(sessionId) || sessionId.startsWith('!')) {
      console.log('📂 Skipping folder check for Matrix session:', sessionId);
      return { match: true, session: providedSession || null };
    }

    // Skip folder check for temporary/new sessions
    if (sessionId.startsWith('temp_') || sessionId.startsWith('new_')) {
      console.log('📂 Skipping folder check for temporary/new session:', sessionId);
      return { match: true, session: providedSession || null };
    }

    // Fetch session if not provided
    let sessionToCheck = providedSession;
    if (!sessionToCheck) {
      sessionToCheck = await unifiedSessionService.getSessionById(sessionId);
      if (!sessionToCheck) {
        return { match: false, session: null, error: 'SESSION_NOT_FOUND' };
      }
    }

    // Get current window folder
    const currentFolder = window.appConfig.get('GOOSE_WORKING_DIR') as string;
    const sessionFolder = sessionToCheck.working_dir;

    // Handle empty working_dir gracefully (treat as match to allow opening)
    if (!sessionFolder || !currentFolder) {
      console.log('📂 Empty working_dir, allowing session open:', { sessionFolder, currentFolder });
      return { match: true, session: sessionToCheck };
    }

    // Normalize paths for comparison (remove trailing slashes)
    const normalizedCurrent = currentFolder.replace(/\/$/, '');
    const normalizedSession = sessionFolder.replace(/\/$/, '');

    const match = normalizedCurrent === normalizedSession;
    
    console.log('📂 Folder check:', {
      sessionId,
      currentFolder: normalizedCurrent,
      sessionFolder: normalizedSession,
      match
    });

    return { match, session: sessionToCheck };
  }, []);

  // Open an existing session in a new tab or switch to it if already open
  const openExistingSession = useCallback(async (sessionId: string, title?: string, isCollaborativeJoin?: boolean, providedSession?: Session): Promise<{ success: boolean; session?: Session; error?: string }> => {
    console.log('📂 Opening existing session:', { sessionId, title, isCollaborativeJoin });

    // Check if session is already open in a tab
    const existingTab = tabStates.find(ts => ts.tab.sessionId === sessionId);
    if (existingTab) {
      console.log('📂 Session already open, switching to existing tab:', existingTab.tab.id);
      setActiveTabId(existingTab.tab.id);
      return { success: true };
    }

    // Check folder match
    const folderCheck = await checkFolderMatch(sessionId, providedSession);
    if (!folderCheck.match) {
      if (folderCheck.error === 'SESSION_NOT_FOUND') {
        return { success: false, error: 'SESSION_NOT_FOUND' };
      }
      console.log('📂 Folder mismatch detected:', {
        sessionId,
        sessionFolder: folderCheck.session?.working_dir,
        currentFolder: window.appConfig.get('GOOSE_WORKING_DIR') as string
      });
      return { 
        success: false, 
        session: folderCheck.session || undefined, 
        error: 'FOLDER_MISMATCH' 
      };
    }

    const session = folderCheck.session || providedSession;

    // CRITICAL: Check if this is a Matrix session by looking up Matrix metadata
    // BUT ONLY if the user explicitly requested a Matrix session
    let isMatrixSession = false;
    let matrixMetadata: any = null;
    
    // SECURITY: Only check for Matrix metadata if this is NOT a solo session creation
    // Solo sessions should NEVER be treated as Matrix sessions unless explicitly requested
    const isExplicitMatrixRequest = title && title.includes('Matrix');
    
    if (!sessionId.startsWith('new_') && isExplicitMatrixRequest) {
      try {
        console.log('🔍 Checking if session is Matrix session (explicit Matrix request):', sessionId);
        matrixMetadata = await sessionMappingService.getMatrixMetadataForBackendSession(sessionId);
        if (matrixMetadata) {
          isMatrixSession = true;
          console.log('✅ Session is Matrix session, metadata:', matrixMetadata);
        } else {
          console.log('ℹ️ Session is regular session, no Matrix metadata found');
        }
      } catch (error) {
        console.warn('⚠️ Failed to check Matrix metadata for session:', error);
      }
    } else {
      console.log('🚫 Skipping Matrix metadata check for solo session:', {
        sessionId,
        title,
        isExplicitMatrixRequest,
        startsWithNew: sessionId.startsWith('new_')
      });
    }

    // Create new tab with appropriate properties based on session type
    let newTab: Tab;
    if (isMatrixSession && matrixMetadata) {
      // CRITICAL: Use the actual backend session ID, not matrix_ format
      // The Matrix context comes from the tab properties, not the sessionId
      const matrixTitle = matrixMetadata.roomName || title || `Matrix Chat ${matrixMetadata.roomId.substring(1, 8)}`;
      
      console.log('📱 Creating Matrix tab from backend session:', {
        backendSessionId: sessionId, // Use actual backend session ID
        matrixRoomId: matrixMetadata.roomId,
        matrixRecipientId: matrixMetadata.recipientId,
        title: matrixTitle
      });
      
      newTab = createNewTab({
        sessionId: sessionId, // Use actual backend session ID for API calls
        title: matrixTitle,
        type: 'matrix',
        matrixRoomId: matrixMetadata.roomId,
        matrixRecipientId: matrixMetadata.recipientId,
        isActive: true
      });
    } else {
      // Create regular chat tab
      newTab = createNewTab({
        sessionId,
        title: title || 'Loading...',
        isActive: true,
        isCollaborativeJoin: isCollaborativeJoin || false
      });
    }
    
    const newTabState: TabState = {
      tab: newTab,
      chat: createNewChat(newTab.sessionId),
      loadingChat: false
    };
    
    console.log('📂 Creating new tab for existing session:', {
      tabId: newTab.id,
      sessionId: newTab.sessionId,
      type: newTab.type,
      matrixRoomId: newTab.matrixRoomId,
      title: newTab.title,
      isMatrixSession
    });
    
    setTabStates(prev => [...prev, newTabState]);
    setActiveTabId(newTab.id);

    // Try to sync title from backend after tab is created (only for existing sessions)
    if (!sessionId.startsWith('new_')) {
      setTimeout(() => {
        syncTabTitleWithBackend(newTab.id).catch(error => {
          console.warn('Failed to sync title for opened session:', error);
        });
      }, 100);
    }

    return { success: true, session };
  }, [tabStates, syncTabTitleWithBackend, checkFolderMatch]);

  // Update session ID for a tab (used when a new session gets a real backend ID)
  const updateSessionId = useCallback((tabId: string, newSessionId: string) => {
    console.log('🔄 Updating session ID for tab:', { tabId, newSessionId });
    
    setTabStates(prev => {
      const current = prev.find(ts => ts.tab.id === tabId);
      const oldSessionId = current?.tab.sessionId;
      const isCollabTab = !!(current?.tab.isCollaborative || current?.tab.isCollaborativeJoin);

      // If this tab is in collaboration mode, migrate the Supabase collaborative session's
      // goose_session_id so other machines can find it by the updated session id.
      if (
        isCollabTab &&
        supabaseEnabled &&
        supabaseClient &&
        oldSessionId &&
        oldSessionId !== newSessionId
      ) {
        void (async () => {
          try {
            const existing = await getSessionByGooseId(supabaseClient, oldSessionId);
            if (existing) {
              await migrateCollaborativeSessionGooseSessionId(supabaseClient, oldSessionId, newSessionId);
            }
          } catch (e) {
            console.warn('[TabContext] Failed to migrate collaborative goose_session_id:', e);
          }
        })();
      }

      return prev.map(ts =>
        ts.tab.id === tabId
          ? {
              ...ts,
              tab: { ...ts.tab, sessionId: newSessionId },
              chat: { ...ts.chat, sessionId: newSessionId },
            }
          : ts
      );
    });
  }, [supabaseClient, supabaseEnabled]);

  // Update just the tab title without affecting messages or other state
  const updateTabTitle = useCallback((tabId: string, title: string) => {
    console.log('🏷️ Updating tab title:', { tabId, title });
    
    setTabStates(prev => prev.map(ts => 
      ts.tab.id === tabId 
        ? { 
            ...ts, 
            tab: { ...ts.tab, title },
            chat: { ...ts.chat, title }
          }
        : ts
    ));
  }, []);

  // Mark a tab as having an active collaborative session
  const setTabCollaborative = useCallback((tabId: string, isCollaborative: boolean) => {
    console.log('👥 Setting tab collaborative status:', { tabId, isCollaborative });
    
    setTabStates(prev => prev.map(ts => 
      ts.tab.id === tabId 
        ? { 
            ...ts, 
            tab: { ...ts.tab, isCollaborative }
          }
        : ts
    ));
  }, []);

  // Sidecar management functions
  const showSidecarView = useCallback((tabId: string, view: TabSidecarView) => {
    
    setTabStates(prev => prev.map(ts => {
      if (ts.tab.id !== tabId) return ts;
      
      const currentSidecarState = ts.tab.sidecarState || { activeViews: [], views: [] };
      
      // Add or update the view
      const existingViewIndex = currentSidecarState.views.findIndex(v => v.id === view.id);
      let updatedViews;
      if (existingViewIndex >= 0) {
        updatedViews = [...currentSidecarState.views];
        updatedViews[existingViewIndex] = view;
      } else {
        updatedViews = [...currentSidecarState.views, view];
      }
      
      // Add to active views if not already active
      const updatedActiveViews = currentSidecarState.activeViews.includes(view.id)
        ? currentSidecarState.activeViews
        : [...currentSidecarState.activeViews, view.id];
      
      return {
        ...ts,
        tab: {
          ...ts.tab,
          sidecarState: {
            activeViews: updatedActiveViews,
            views: updatedViews
          }
        }
      };
    }));
  }, []);

  const hideSidecarView = useCallback((tabId: string, viewId: string) => {
    
    // If this is a web viewer, trigger explicit cleanup
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (tabState?.tab.sidecarState) {
      const view = tabState.tab.sidecarState.views.find(v => v.id === viewId);
      if (view && view.contentType === 'web') {
        // Dispatch a custom event to trigger WebBrowser cleanup
        window.dispatchEvent(new CustomEvent('sidecar-web-view-closing', { 
          detail: { tabId, viewId } 
        }));
      }
    }
    
    setTabStates(prev => prev.map(ts => {
      if (ts.tab.id !== tabId || !ts.tab.sidecarState) return ts;
      
      return {
        ...ts,
        tab: {
          ...ts.tab,
          sidecarState: {
            ...ts.tab.sidecarState,
            activeViews: ts.tab.sidecarState.activeViews.filter(id => id !== viewId)
          }
        }
      };
    }));
  }, [tabStates]);

  const hideAllSidecarViews = useCallback((tabId: string) => {
    
    setTabStates(prev => prev.map(ts => {
      if (ts.tab.id !== tabId || !ts.tab.sidecarState) return ts;
      
      return {
        ...ts,
        tab: {
          ...ts.tab,
          sidecarState: {
            ...ts.tab.sidecarState,
            activeViews: []
          }
        }
      };
    }));
  }, []);

  const getSidecarState = useCallback((tabId: string): TabSidecarState | undefined => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    return tabState?.tab.sidecarState;
  }, [tabStates]);

  // Helper function to create sidecar views for specific types
  const showDiffViewer = useCallback((tabId: string, diffContent: string, fileName = 'File', instanceId?: string) => {
    const id = instanceId ? `diff-${instanceId}` : 'diff';
    
    const diffView: TabSidecarView = {
      id,
      title: 'Diff Viewer',
      iconType: 'diff',
      contentType: 'diff',
      contentProps: { diffContent },
      fileName,
      instanceId,
    };
    
    showSidecarView(tabId, diffView);
  }, [showSidecarView]);

  const showLocalhostViewer = useCallback((tabId: string, url = 'http://localhost:3000', title = 'Localhost Viewer', instanceId?: string) => {
    const id = instanceId ? `localhost-${instanceId}` : 'localhost';
    
    const localhostView: TabSidecarView = {
      id,
      title,
      iconType: 'localhost',
      contentType: 'localhost',
      contentProps: { url, title },
      fileName: url,
      instanceId,
    };
    
    showSidecarView(tabId, localhostView);
  }, [showSidecarView]);

  const showWebViewer = useCallback((tabId: string, url = 'https://google.com', title = 'Web Browser', instanceId?: string) => {
    const id = instanceId ? `web-${instanceId}` : 'web';
    
    const webView: TabSidecarView = {
      id,
      title,
      iconType: 'web',
      contentType: 'web',
      contentProps: { url, title },
      fileName: url,
      instanceId,
    };
    
    showSidecarView(tabId, webView);
  }, [showSidecarView]);

  const showFileViewer = useCallback((tabId: string, filePath: string, instanceId?: string) => {
    const fileName = filePath.split('/').pop() || filePath;
    const id = instanceId ? `file-${instanceId}` : 'file';
    
    const fileView: TabSidecarView = {
      id,
      title: 'File Viewer',
      iconType: 'file',
      contentType: 'file',
      contentProps: { path: filePath },
      fileName,
      instanceId,
    };
    
    showSidecarView(tabId, fileView);
  }, [showSidecarView]);

  const showDocumentEditor = useCallback((tabId: string, filePath?: string, initialContent?: string, instanceId?: string) => {
    const fileName = filePath ? filePath.split('/').pop() || filePath : 'Untitled Document';
    const id = instanceId ? `editor-${instanceId}` : 'editor';
    
    const editorView: TabSidecarView = {
      id,
      title: 'Document Editor',
      iconType: 'editor',
      contentType: 'editor',
      contentProps: { path: filePath, content: initialContent },
      fileName,
      instanceId,
    };
    
    showSidecarView(tabId, editorView);
  }, [showSidecarView]);

  // Open a Matrix chat in a new tab or switch to it if already open
  const openMatrixChat = useCallback(async (roomId: string, senderId: string, roomName?: string) => {
    console.log('📱 TabContext: Opening Matrix chat for room:', roomId, 'sender:', senderId, 'roomName:', roomName);

    // Check if we already have a tab for this Matrix room
    const existingTabState = tabStates.find(ts => 
      ts.tab.type === 'matrix' && ts.tab.matrixRoomId === roomId
    );
    
    if (existingTabState) {
      console.log('📱 Matrix room already open in tab, switching to it:', existingTabState.tab.id);
      setActiveTabId(existingTabState.tab.id);
      return;
    }

    // CRITICAL: Ensure we're joined to the room before opening chat
    try {
      console.log('🚪 Ensuring user is joined to Matrix room before opening chat...');
      await matrixService.joinRoom(roomId);
      console.log('✅ Successfully joined Matrix room (or already joined)');
    } catch (error) {
      console.error('❌ Failed to join Matrix room:', error);
      // Don't block the chat opening - user might already be in the room
      // The joinRoom method handles already-joined cases gracefully
    }

    // Get or create the backend session AFTER ensuring room membership
    const tabTitle = roomName || `Chat with ${senderId.split(':')[0].substring(1)}`;
    
    console.log('📱 Getting/creating backend session after ensuring room membership...');
    let backendSessionId = sessionMappingService.getGooseSessionId(roomId);
    
    if (!backendSessionId) {
      console.log('📱 No existing mapping found for room:', roomId);
      
      // Wait a moment for the joinRoom operation to complete and create mappings
      console.log('📱 Waiting for room join to complete and mappings to be created...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check again for mapping
      backendSessionId = sessionMappingService.getGooseSessionId(roomId);
      
      if (!backendSessionId) {
        // Wait up to 3 more seconds for the mapping to appear
        let attempts = 0;
        while (attempts < 30 && !backendSessionId) {
          await new Promise(resolve => setTimeout(resolve, 100));
          backendSessionId = sessionMappingService.getGooseSessionId(roomId);
          attempts++;
          
          if (backendSessionId) {
            console.log('✅ Found mapping after waiting:', backendSessionId, 'attempts:', attempts);
            break;
          }
        }
      }
      
      // If still no mapping, create one manually
      if (!backendSessionId) {
        console.log('📱 Creating new mapping with backend session manually');
        try {
          // Get room participants for the mapping
          const rooms = matrixService.getRooms();
          const room = rooms.find(r => r.roomId === roomId);
          const participants = room ? room.members.map(m => m.userId) : [senderId];
          
          const mapping = await sessionMappingService.createMappingWithBackendSession(
            roomId, 
            participants, 
            tabTitle, 
            senderId
          );
          backendSessionId = mapping.gooseSessionId;
          console.log('✅ Created new backend session for Matrix room:', backendSessionId);
        } catch (error) {
          console.error('❌ Failed to create backend session for Matrix room:', error);
          // Use a temporary session ID as fallback
          backendSessionId = `temp_matrix_${Date.now()}`;
        }
      }
    } else {
      console.log('✅ Found existing backend session for Matrix room:', backendSessionId);
    }
    
    // Now create the tab with the real backend session ID
    const newTab = createNewTab({
      sessionId: backendSessionId,
      title: tabTitle,
      type: 'matrix',
      matrixRoomId: roomId,
      matrixRecipientId: senderId,
      isActive: true
    });
    
    const newTabState: TabState = {
      tab: newTab,
      chat: createNewChat(backendSessionId, { 
        recipeConfig: null, // EXPLICIT: Matrix chats should never have recipes
        aiEnabled: true 
      }),
      loadingChat: false // No need for loading state since we have the real session ID
    };
    
    // Add the tab and set it as active
    setTabStates(prev => [...prev, newTabState]);
    setActiveTabId(newTab.id);
    
    console.log('✅ Created Matrix tab with backend session:', {
      tabId: newTab.id,
      sessionId: backendSessionId,
      roomId,
      senderId
    });
  }, [tabStates]);

  // Create a backend session for a tab (converts new_ session to real backend session)
  const createBackendSession = useCallback(async (tabId: string): Promise<string> => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (!tabState) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    // If already has a backend session (not temporary), return it
    if (!tabState.tab.sessionId.startsWith('temp_') && !tabState.tab.sessionId.startsWith('new_')) {
      console.log('🏗️ Tab already has backend session:', tabState.tab.sessionId);
      return tabState.tab.sessionId;
    }

    try {
      console.log('🏗️ Creating backend session for tab:', tabId);
      
      // Create a new backend session using startAgent
      const response = await startAgent({
        body: {
          working_dir: window.appConfig.get('GOOSE_WORKING_DIR') as string,
        }
      });

      if (!response.data?.id) {
        throw new Error('Failed to create backend session - no session ID returned');
      }

      const newSessionId = response.data.id;
      console.log('✅ Created backend session:', newSessionId);

      // Update the tab with the new session ID
      setTabStates(prev => prev.map(ts => 
        ts.tab.id === tabId 
          ? { 
              ...ts, 
              tab: { ...ts.tab, sessionId: newSessionId },
              chat: { ...ts.chat, sessionId: newSessionId }
            }
          : ts
      ));

      return newSessionId;
    } catch (error) {
      console.error('❌ Failed to create backend session:', error);
      throw error;
    }
  }, [tabStates]);

  // Morph a regular chat tab into a Matrix session
  const morphTabToMatrix = useCallback(async (
    tabId: string, 
    roomId: string, 
    recipientId: string, 
    roomTitle?: string
  ): Promise<void> => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (!tabState) {
      throw new Error(`Tab not found: ${tabId}`);
    }

    console.log('🔄 Morphing tab to Matrix:', {
      tabId,
      currentSessionId: tabState.tab.sessionId,
      roomId,
      recipientId,
      roomTitle
    });

    try {
      // Ensure we have a backend session first
      let backendSessionId = tabState.tab.sessionId;
      if (backendSessionId.startsWith('temp_') || backendSessionId.startsWith('new_')) {
        console.log('🏗️ Creating backend session before morphing to Matrix');
        backendSessionId = await createBackendSession(tabId);
      }

      // Create the Matrix mapping in the session mapping service
      await sessionMappingService.createMapping(roomId, backendSessionId, roomTitle || `Matrix Chat`, recipientId);
      console.log('✅ Created Matrix mapping for backend session:', backendSessionId);

      // Update the tab to Matrix type with Matrix properties
      const matrixTitle = roomTitle || `Matrix Chat ${roomId.substring(1, 8)}`;
      
      setTabStates(prev => prev.map(ts => 
        ts.tab.id === tabId 
          ? { 
              ...ts, 
              tab: { 
                ...ts.tab, 
                type: 'matrix',
                matrixRoomId: roomId,
                matrixRecipientId: recipientId,
                title: matrixTitle,
                sessionId: backendSessionId // Keep the backend session ID
              },
              chat: { 
                ...ts.chat, 
                title: matrixTitle,
                sessionId: backendSessionId,
                recipeConfig: null, // EXPLICIT: Matrix chats should never have recipes
                aiEnabled: false // Matrix chats typically have AI disabled
              }
            }
          : ts
      ));

      console.log('✅ Successfully morphed tab to Matrix:', {
        tabId,
        backendSessionId,
        roomId,
        recipientId,
        title: matrixTitle
      });

    } catch (error) {
      console.error('❌ Failed to morph tab to Matrix:', error);
      throw error;
    }
  }, [tabStates, createBackendSession]);

  const contextValue: TabContextType = {
    tabStates,
    activeTabId,
    setActiveTabId,
    handleTabClick,
    handleTabClose,
    handleNewTab,
    createChatTab,
    handleChatUpdate,
    handleMessageSubmit,
    getActiveTabState,
    restoreTabState,
    clearTabState,
    syncTabTitleWithBackend,
    updateTabTitleFromMessage,
    openExistingSession,
    updateSessionId,
    // Tab title update (without touching messages)
    updateTabTitle,
    // Collaborative session methods
    setTabCollaborative,
    // Matrix-specific methods
    openMatrixChat,
    morphTabToMatrix,
    createBackendSession,
    // Sidecar functions
    showSidecarView,
    hideSidecarView,
    hideAllSidecarViews,
    getSidecarState,
    showDiffViewer,
    showLocalhostViewer,
    showWebViewer,
    showFileViewer,
    showDocumentEditor
  };

  return (
    <TabContext.Provider value={contextValue}>
      {children}
    </TabContext.Provider>
  );
};

export const useTabContext = (): TabContextType => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};
