import React, { useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { TabbedChatContainer } from './TabbedChatContainer';
import { ViewOptions } from '../utils/navigationUtils';
import { ContextManagerProvider } from './context_management/ContextManager';
import { useNavigation } from './Layout/AppLayout';
import { useTabContext } from '../contexts/TabContext';
import { unifiedSessionService } from '../services/UnifiedSessionService';
import { useSupabase } from '../contexts/SupabaseContext';
import { getSessionById, redeemInvite } from '../services/collaborativeSessionService';

interface TabbedPairRouteProps {
  setIsGoosehintsModalOpen: (isOpen: boolean) => void;
}

export const TabbedPairRoute: React.FC<TabbedPairRouteProps> = ({
  setIsGoosehintsModalOpen
}) => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeState = location.state as ViewOptions | undefined;
  const initialMessage = routeState?.initialMessage;
  const { isNavExpanded } = useNavigation();
  const { openExistingSession, openMatrixChat, handleNewTab, createChatTab, tabStates } = useTabContext();
  const { client: supabaseClient, isEnabled: supabaseEnabled } = useSupabase();

  // Track if we've already handled the initial message to prevent duplicate handling
  const [hasHandledInitialMessage, setHasHandledInitialMessage] = React.useState(false);
  
  // Track if we've already auto-opened sessions to prevent re-opening on every navigation
  const hasAutoOpenedRef = useRef(false);

  // Handle initial message from Hub - create a new tab with the message
  useEffect(() => {
    if (initialMessage && !hasHandledInitialMessage) {
      console.log('📝 TabbedPairRoute: Handling initial message from Hub:', initialMessage);
      
      // Create a new tab - the initialMessage will be passed to TabbedChatContainer
      // and auto-submitted in the new tab
      handleNewTab();
      setHasHandledInitialMessage(true);
      
      // Clear the location state to prevent re-handling on navigation
      window.history.replaceState({}, '', window.location.href);
    }
  }, [initialMessage, hasHandledInitialMessage, handleNewTab]);

  // Handle resuming existing sessions from URL parameters
  useEffect(() => {
    const resumeSessionId = searchParams.get('resumeSessionId');
    if (resumeSessionId) {
      console.log('📂 Resuming session from URL parameter:', resumeSessionId);
      openExistingSession(resumeSessionId).then((result) => {
        if (!result.success && result.error === 'FOLDER_MISMATCH') {
          // Folder mismatch - could show a toast or handle silently
          console.warn('📂 Folder mismatch when resuming from URL, session not opened');
        }
      }).catch((error) => {
        console.error('📂 Failed to resume session from URL:', error);
      });
      
      // Clear the URL parameter to prevent re-opening on refresh
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('resumeSessionId');
      const newUrl = `${window.location.pathname}${newSearchParams.toString() ? '?' + newSearchParams.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [searchParams, openExistingSession]);

  // Handle collaborative invite deep-links:
  // - `?session=<gooseSessionId>&collab=<collabSessionId>` (accept-invite flow)
  // - `?collab=<inviteToken>` (invite link flow)
  useEffect(() => {
    const sessionId = searchParams.get('session');
    const collabParam = searchParams.get('collab');

    if (!sessionId && !collabParam) return;

    const clearParams = () => {
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete('session');
      newSearchParams.delete('collab');
      const newUrl = `${window.location.pathname}${newSearchParams.toString() ? '?' + newSearchParams.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    };

    // Case A: We already have a Goose session id. Open tab and join the collab session id.
    if (sessionId) {
      (async () => {
        try {
          const openResult = await openExistingSession(sessionId, undefined, !!collabParam)
          let gooseSessionIdToJoin = sessionId;
          if (!openResult.success) {
            const created = await createChatTab({ title: 'Collaborative session', isCollaborativeJoin: true });
            if (created) gooseSessionIdToJoin = created.sessionId;
          }

          if (collabParam) {
            setTimeout(() => {
              window.dispatchEvent(
                new CustomEvent('collab-session-joined', {
                  detail: { gooseSessionId: gooseSessionIdToJoin, collabSessionId: collabParam },
                })
              );
            }, 50);
          }
        } finally {
          clearParams();
        }
      })();
      return;
    }

    // Case B: Token-only link. Redeem token to collab session id, then open the linked Goose session.
    if (collabParam && supabaseEnabled && supabaseClient) {
      (async () => {
        try {
          const collabSessionId = await redeemInvite(supabaseClient, collabParam);
          const collabSession = await getSessionById(supabaseClient, collabSessionId);
          const gooseSessionId = collabSession?.goose_session_id;
          if (!gooseSessionId) return;

          await openExistingSession(gooseSessionId, collabSession.title, true);
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('collab-session-joined', {
                detail: { gooseSessionId, collabSessionId },
              })
            );
          }, 50);
        } catch (e) {
          console.warn('[TabbedPairRoute] Failed to redeem/join collab link:', e);
        } finally {
          clearParams();
        }
      })();
    } else {
      // No Supabase configured; clear params to avoid loop.
      clearParams();
    }
  }, [searchParams, openExistingSession, createChatTab, supabaseEnabled, supabaseClient]);

  // Handle Matrix tab creation from notifications
  useEffect(() => {
    const handleCreateMatrixTab = (event: CustomEvent) => {
      const { roomId, senderId } = event.detail;
      console.log('📱 TabbedPairRoute: Creating Matrix tab for room:', roomId, 'sender:', senderId);
      
      // Use the new openMatrixChat method - much simpler!
      openMatrixChat(roomId, senderId);
    };

    window.addEventListener('create-matrix-tab', handleCreateMatrixTab as EventListener);
    return () => {
      window.removeEventListener('create-matrix-tab', handleCreateMatrixTab as EventListener);
    };
  }, [openMatrixChat]);

  // Auto-open latest 3-4 sessions for the current folder
  useEffect(() => {
    // Only run once per mount, and only if we haven't already auto-opened
    if (hasAutoOpenedRef.current) {
      return;
    }

    // Skip if there's an active conversation (user is mid-chat)
    const hasActiveConversation = tabStates.some(ts => ts.chat.messages.length > 0);
    if (hasActiveConversation) {
      console.log('📂 Skipping auto-open - user has active conversation');
      return;
    }

    const autoOpenSessions = async () => {
      try {
        // Get current window folder
        const currentFolder = window.appConfig.get('GOOSE_WORKING_DIR') as string;
        if (!currentFolder) {
          console.log('📂 No current folder, skipping auto-open');
          return;
        }

        // Get latest sessions for this folder
        const latestSessions = await unifiedSessionService.getLatestSessionsForFolder(currentFolder, 4);
        
        // Filter out sessions that are already open in tabs
        const openSessionIds = new Set(tabStates.map(ts => ts.tab.sessionId));
        const sessionsToOpen = latestSessions.filter(s => !openSessionIds.has(s.id));

        if (sessionsToOpen.length === 0) {
          console.log('📂 No new sessions to auto-open');
          hasAutoOpenedRef.current = true;
          return;
        }

        console.log(`📂 Auto-opening ${sessionsToOpen.length} latest sessions for folder:`, currentFolder);

        // Open each session as a tab (silently, no toast)
        for (const session of sessionsToOpen) {
          const result = await openExistingSession(session.id, session.description, undefined, session);
          if (!result.success && result.error === 'FOLDER_MISMATCH') {
            // Shouldn't happen since we filtered by folder, but skip if it does
            console.warn('📂 Unexpected folder mismatch during auto-open:', session.id);
          }
        }

        hasAutoOpenedRef.current = true;
      } catch (error) {
        console.error('📂 Error auto-opening sessions:', error);
        hasAutoOpenedRef.current = true; // Don't retry on error
      }
    };

    // Small delay to ensure everything is initialized
    const timeoutId = setTimeout(() => {
      autoOpenSessions();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [openExistingSession, tabStates]);

  const handleMessageSubmit = (message: string, tabId: string) => {
    console.log('Message submitted in tab:', tabId, message);
    // Here you could add analytics, logging, or other side effects
  };

  return (
    <ContextManagerProvider>
      <TabbedChatContainer
        setIsGoosehintsModalOpen={setIsGoosehintsModalOpen}
        onMessageSubmit={handleMessageSubmit}
        initialMessage={initialMessage}
        sidebarCollapsed={!isNavExpanded}
      />
    </ContextManagerProvider>
  );
};
