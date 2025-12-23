import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TabBar } from './TabBar';
import BaseChat2 from './BaseChat2';
import { TabSidecar } from './TabSidecar';
import MultiPanelTabSidecar from './MultiPanelTabSidecar';
import { useTabContext } from '../contexts/TabContext';
import { ResizableSplitter } from './Layout/ResizableSplitter';
import { TaskExecutionProvider } from '../contexts/TaskExecutionContext';
import { useNavigation } from './Layout/AppLayout';
import { Terminal } from 'lucide-react';

// Import SVG icons
import UnionIcon from '../assets/Union.svg';
import { NotificationDropdown } from './NotificationDropdown';

interface TabbedChatContainerProps {
  setIsGoosehintsModalOpen?: (isOpen: boolean) => void;
  onMessageSubmit?: (message: string, tabId: string) => void;
  className?: string;
  initialMessage?: string;
  sidebarCollapsed?: boolean; // Add prop to track sidebar state
}

export const TabbedChatContainer: React.FC<TabbedChatContainerProps> = ({
  setIsGoosehintsModalOpen,
  onMessageSubmit,
  className,
  initialMessage,
  sidebarCollapsed = false
}) => {
  const location = useLocation();
  const { isNavExpanded, setIsNavExpanded } = useNavigation();
  // Show icons on main routes (chat view and home)
  const isMainChatView = location.pathname === '/pair' || location.pathname === '/tabs' || location.pathname === '/';
  const {
    tabStates,
    activeTabId,
    handleTabClick,
    handleTabClose,
    handleNewTab,
    handleChatUpdate,
    handleMessageSubmit: contextHandleMessageSubmit,
    getActiveTabState,
    syncTabTitleWithBackend,
    updateTabTitleFromMessage,
    updateSessionId,
    // Sidecar functions
    hideSidecarView,
    getSidecarState
  } = useTabContext();

  const handleMessageSubmitWrapper = useCallback(async (message: string, tabId: string) => {
    // Find the tab state to check if this is the first message
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    const isFirstMessage = tabState && tabState.chat.messages.length === 0 && tabState.tab.title === 'New Chat';
    
    // Handle the message submission
    contextHandleMessageSubmit(message, tabId);
    onMessageSubmit?.(message, tabId);
    
    // Update tab title from first message
    if (isFirstMessage && message.trim()) {
      console.log('🏷️ First message detected, updating tab title');
      try {
        await updateTabTitleFromMessage(tabId, message);
      } catch (error) {
        console.warn('Failed to update tab title from message:', error);
      }
    }
  }, [contextHandleMessageSubmit, onMessageSubmit, tabStates, updateTabTitleFromMessage]);

  // Sync tab titles with backend when component mounts or tabs change
  useEffect(() => {
    const syncAllTabTitles = async () => {
      for (const tabState of tabStates) {
        // Only sync titles for existing sessions (not new sessions that start with 'new_')
        // and only if the tab still shows "New Chat" or "Loading..."
        const isExistingSession = tabState.tab.sessionId && !tabState.tab.sessionId.startsWith('new_');
        const needsTitleSync = tabState.tab.title === 'New Chat' || tabState.tab.title === 'Loading...';
        
        if (isExistingSession && needsTitleSync) {
          try {
            console.log('🏷️ Attempting to sync title for existing session:', tabState.tab.sessionId);
            await syncTabTitleWithBackend(tabState.tab.id);
          } catch (error) {
            console.warn('Failed to sync tab title for session:', tabState.tab.sessionId, error);
          }
        }
      }
    };

    // Only run on mount or when we have tabs to sync
    if (tabStates.length > 0) {
      syncAllTabTitles();
    }
  }, [tabStates, syncTabTitleWithBackend]); // Run when tabStates change

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey)) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            handleNewTab();
            break;
          case 'w':
            if (tabStates.length > 1) {
              e.preventDefault();
              handleTabClose(activeTabId);
            }
            break;
          case 'Tab':
            e.preventDefault();
            const currentIndex = tabStates.findIndex(ts => ts.tab.id === activeTabId);
            const nextIndex = e.shiftKey 
              ? (currentIndex - 1 + tabStates.length) % tabStates.length
              : (currentIndex + 1) % tabStates.length;
            handleTabClick(tabStates[nextIndex].tab.id);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNewTab, handleTabClose, handleTabClick, activeTabId, tabStates]);



  // Handle session updates from BaseChat2 (when a new session gets a real backend ID)
  const handleSessionUpdate = useCallback((newSessionId: string, tabId: string) => {
    const tabState = tabStates.find(ts => ts.tab.id === tabId);
    if (tabState && tabState.tab.sessionId !== newSessionId) {
      console.log('🔄 Session ID changed for tab:', {
        tabId,
        oldSessionId: tabState.tab.sessionId,
        newSessionId
      });
      updateSessionId(tabId, newSessionId);
    }
  }, [tabStates, updateSessionId]);

  // Handle chat updates from BaseChat2 - only update when session ID or title changes
  const handleSetChat = useCallback((chat: any) => {
    const currentActiveTabState = getActiveTabState();
    if (!currentActiveTabState) return;

    let shouldUpdate = false;
    const updates: any = {};

    // Check if session ID changed (new session got a real backend ID)
    if (chat.sessionId && chat.sessionId !== currentActiveTabState.tab.sessionId) {
      console.log('🔄 Session ID changed:', {
        tabId: currentActiveTabState.tab.id,
        oldSessionId: currentActiveTabState.tab.sessionId,
        newSessionId: chat.sessionId
      });
      updates.sessionId = chat.sessionId;
      shouldUpdate = true;
    }

    // Check if title changed (from backend session description or first message)
    if (chat.title && chat.title !== currentActiveTabState.tab.title && chat.title !== 'New Chat') {
      console.log('🏷️ Tab title changed:', {
        tabId: currentActiveTabState.tab.id,
        oldTitle: currentActiveTabState.tab.title,
        newTitle: chat.title
      });
      updates.title = chat.title;
      shouldUpdate = true;
    }

    // Only update if something actually changed
    if (shouldUpdate) {
      if (updates.sessionId) {
        updateSessionId(currentActiveTabState.tab.id, updates.sessionId);
      }
      if (updates.title) {
        // Update the chat object with new title and session ID
        const updatedChat = {
          ...currentActiveTabState.chat,
          title: updates.title,
          sessionId: updates.sessionId || currentActiveTabState.chat.sessionId
        };
        handleChatUpdate(currentActiveTabState.tab.id, updatedChat);
      }
    }
  }, [getActiveTabState, updateSessionId, handleChatUpdate]);

  // Sidecar resizing state
  const [chatWidth, setChatWidth] = useState(60); // Default 60% for chat, 40% for sidecar

  const activeTabState = getActiveTabState();
  const sidecarState = activeTabState ? getSidecarState(activeTabState.tab.id) : undefined;
  const hasSidecar = sidecarState && sidecarState.activeViews.length > 0;

  // Track working directory for TabBar tooltip
  const [workingDirectory, setWorkingDirectory] = useState<string>('');

  // Read working directory from appConfig
  useEffect(() => {
    const readWorkingDirectory = () => {
      try {
        return window.appConfig.get('GOOSE_WORKING_DIR') as string;
      } catch (error) {
        return '';
      }
    };

    setWorkingDirectory(readWorkingDirectory());

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ path?: string }>;
      if (customEvent.detail?.path) {
        setWorkingDirectory(customEvent.detail.path);
      } else {
        setWorkingDirectory(readWorkingDirectory());
      }
    };

    window.addEventListener('goose-working-dir-changed', handler as EventListener);
    return () => {
      window.removeEventListener('goose-working-dir-changed', handler as EventListener);
    };
  }, []);

  return (
    <TaskExecutionProvider>
      <div className={`flex flex-col h-full ${className || ''}`}>
        {/* Row 1: Top Bar - Show Launcher + Terminal icon + traffic lights spacer + blur bar + notifications */}
        <div className="flex-shrink-0 h-11 flex items-center relative z-[100]">
          {/* Show Launcher button - top left corner, only visible on main chat view */}
          {isMainChatView && (
            <button
              onClick={() => setIsNavExpanded(!isNavExpanded)}
                    className="fixed left-[76px] top-[6px] z-[101] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 dark:hover:bg-white/10 transition-colors no-drag"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title={isNavExpanded ? "Hide launcher" : "Show launcher"}
            >
                    <img
                      src={UnionIcon}
                      alt="Show Launcher"
                      className="w-5 h-5 pointer-events-none transition-transform duration-200"
                      style={{ transform: isNavExpanded ? 'scaleX(-1)' : 'scaleX(1)' }}
                    />
            </button>
          )}
          
          {/* Terminal icon - new session button, only visible on main chat view */}
          {isMainChatView && (
            <button
              onClick={handleNewTab}
              className="absolute left-[112px] top-[6px] z-[101] w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 dark:hover:bg-white/10 transition-colors no-drag"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="New session (Ctrl+T)"
            >
              <Terminal className="w-5 h-5 text-text-muted hover:text-text-default pointer-events-none" />
            </button>
          )}
          
          {/* Spacer to account for traffic lights + icons (only if icons are visible) */}
          <div className={isMainChatView ? "w-[156px] flex-shrink-0" : "w-[76px] flex-shrink-0"} />
          
          {/* Top blur bar - spans most of the width */}
          <div className="flex-1 h-9 mx-2 bg-white/60 dark:bg-black/60 rounded-2xl backdrop-blur-xl flex items-center px-4">
            {/* Future: Add more top bar content here (search, breadcrumbs, etc.) */}
          </div>
          
          {/* Notifications dropdown - top right corner, only visible on main chat view */}
          {isMainChatView && (
            <NotificationDropdown className="absolute right-2 top-[6px] z-[101]" />
          )}
        </div>

        {/* Row 2: Tab Bar */}
        <div className="flex-shrink-0 relative z-[60]">
          <TabBar
            tabs={tabStates.map(ts => ts.tab)}
            activeTabId={activeTabId}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onNewTab={handleNewTab}
            sidebarCollapsed={sidebarCollapsed}
            workingDirectory={workingDirectory}
          />
        </div>

        {/* Main Content Area - Chat and Sidecar */}
        <div className="flex-1 min-h-0 relative overflow-hidden rounded-t-lg">
        {/* Render all tabs but only show the active one - this prevents unmounting */}
        {tabStates.map((tabState) => {
          const isActive = tabState.tab.id === activeTabId;
          const tabSidecarState = getSidecarState(tabState.tab.id);
          const tabHasSidecar = tabSidecarState && tabSidecarState.activeViews.length > 0;
          
          return (
            <div
              key={tabState.tab.id}
              className={`absolute inset-0 ${isActive ? 'block' : 'hidden'}`}
              style={{ 
                visibility: isActive ? 'visible' : 'hidden',
                pointerEvents: isActive ? 'auto' : 'none'
              }}
            >
              {tabHasSidecar ? (
                /* Resizable Split Layout: Chat + Sidecar */
                <ResizableSplitter
                  leftContent={
                    <BaseChat2
                      key={`${tabState.tab.id}-${tabState.tab.sessionId}-${(tabState.tab as any).reloadCount || 0}`} // Force re-mount when session ID or reload counter changes
                      sessionId={tabState.tab.sessionId}
                      setChat={isActive ? handleSetChat : undefined} // Only active tab can update chat
                      setIsGoosehintsModalOpen={isActive ? setIsGoosehintsModalOpen : undefined}
                      onMessageSubmit={isActive ? (message) => handleMessageSubmitWrapper(message, tabState.tab.id) : undefined}
                      onSessionIdChange={isActive ? (newSessionId) => updateSessionId(tabState.tab.id, newSessionId) : undefined}
                      suppressEmptyState={false}
                      showPopularTopics={true}
                      loadingChat={tabState.loadingChat}
                      initialMessage={isActive ? initialMessage : undefined} // Only pass to active tab
                      showParticipantsBar={tabState.tab.type === 'matrix'}
                      matrixRoomId={tabState.tab.matrixRoomId}
                      showPendingInvites={true}
                      tabId={tabState.tab.id}
                      isTabActive={isActive} // New prop to indicate if tab is active
                      isCollaborativeJoin={tabState.tab.isCollaborativeJoin} // Disable Goose for collaborative joins
                    />
                  }
                  rightContent={
                    tabSidecarState && tabSidecarState.activeViews.length > 1 ? (
                      <MultiPanelTabSidecar
                        sidecarState={tabSidecarState}
                        onHideView={isActive ? (viewId) => hideSidecarView(tabState.tab.id, viewId) : () => {}}
                        tabId={tabState.tab.id}
                      />
                    ) : tabSidecarState && tabSidecarState.activeViews.length === 1 ? (
                      <TabSidecar
                        sidecarState={tabSidecarState}
                        onHideView={isActive ? (viewId) => hideSidecarView(tabState.tab.id, viewId) : () => {}}
                        tabId={tabState.tab.id}
                      />
                    ) : null
                  }
                  initialLeftWidth={chatWidth}
                  minLeftWidth={30}
                  maxLeftWidth={80}
                  onResize={isActive ? setChatWidth : undefined} // Only active tab can resize
                  className="h-full"
                  floatingRight={true}
                />
              ) : (
                /* Full Width Chat */
                <BaseChat2
                  key={`${tabState.tab.id}-${tabState.tab.sessionId}-${(tabState.tab as any).reloadCount || 0}`} // Force re-mount when session ID or reload counter changes
                  sessionId={tabState.tab.sessionId}
                  setChat={isActive ? handleSetChat : undefined} // Only active tab can update chat
                  setIsGoosehintsModalOpen={isActive ? setIsGoosehintsModalOpen : undefined}
                  onMessageSubmit={isActive ? (message) => handleMessageSubmitWrapper(message, tabState.tab.id) : undefined}
                  onSessionIdChange={isActive ? (newSessionId) => updateSessionId(tabState.tab.id, newSessionId) : undefined}
                  suppressEmptyState={false}
                  showPopularTopics={true}
                  loadingChat={tabState.loadingChat}
                  initialMessage={isActive ? initialMessage : undefined} // Only pass to active tab
                  showParticipantsBar={tabState.tab.type === 'matrix'}
                  matrixRoomId={tabState.tab.matrixRoomId}
                  showPendingInvites={true}
                  tabId={tabState.tab.id}
                  isTabActive={isActive} // New prop to indicate if tab is active
                  isCollaborativeJoin={tabState.tab.isCollaborativeJoin} // Disable Goose for collaborative joins
                />
              )}
            </div>
          );
        })}
      </div>
      </div>
    </TaskExecutionProvider>
  );
};
