import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, MessageCircle, Bot, Users, Calendar, Target, Folder, History } from 'lucide-react';
import { cn } from '../utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/Tooltip';
import { getSession } from '../api';
import { formatMessageTimestamp } from '../utils/timeUtils';
import '../styles/tabs.css';

// Sidecar view interface for tab-specific sidecars
export interface TabSidecarView {
  id: string;
  title: string;
  iconType: 'diff' | 'localhost' | 'web' | 'file' | 'editor' | 'tool-output';
  contentType: 'diff' | 'localhost' | 'web' | 'file' | 'editor' | 'tool-output';
  contentProps: Record<string, any>;
  fileName?: string;
  instanceId?: string;
}

// Sidecar state for each tab
export interface TabSidecarState {
  activeViews: string[]; // Array of active view IDs
  views: TabSidecarView[]; // All available views for this tab
}

export interface Tab {
  id: string;
  title: string;
  type: 'chat' | 'recipe' | 'matrix';
  sessionId: string;
  isActive: boolean;
  hasUnsavedChanges?: boolean;
  matrixRoomId?: string;
  matrixRecipientId?: string;
  recipeTitle?: string;
  // Add sidecar state to each tab
  sidecarState?: TabSidecarState;
  // Flag to indicate this tab is joining a collaborative session (not hosting)
  isCollaborativeJoin?: boolean;
  // Flag to indicate this tab has an active collaborative session (host or guest)
  isCollaborative?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
  className?: string;
  sidebarCollapsed?: boolean;
  workingDirectory?: string;
}

const getTabIcon = (type: Tab['type']) => {
  switch (type) {
    case 'recipe':
      return <Bot className="w-3 h-3" />;
    case 'matrix':
      return <Users className="w-3 h-3" />;
    default:
      return <MessageCircle className="w-3 h-3" />;
  }
};

const getTabTitle = (tab: Tab) => {
  if (tab.recipeTitle) return tab.recipeTitle;
  if (tab.matrixRoomId) return `Matrix: ${tab.title}`;
  return tab.title || 'New Chat';
};

// Tab tooltip component with session details and workspace directory
const TabTooltip: React.FC<{ tab: Tab; children: React.ReactNode; workingDirectory?: string }> = ({ tab, children, workingDirectory }) => {
  const [sessionData, setSessionData] = useState<{
    messageCount: number;
    totalTokens: number;
    createdAt: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only fetch session data for non-temporary sessions
    if (!tab.sessionId || tab.sessionId.startsWith('temp_') || tab.sessionId.startsWith('new_')) {
      return;
    }

    const fetchSessionData = async () => {
      setIsLoading(true);
      try {
        const response = await getSession({ path: { session_id: tab.sessionId } });
        if (response.data) {
          setSessionData({
            messageCount: response.data.message_count || 0,
            totalTokens: response.data.total_tokens || 0,
            createdAt: response.data.conversation?.[0]?.created || null,
          });
        }
      } catch (error) {
        console.error('Failed to fetch session data for tooltip:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSessionData();
  }, [tab.sessionId]);

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        {children}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="space-y-2">
          {/* Full tab title */}
          <div className="font-medium text-sm">{getTabTitle(tab)}</div>
          
          {/* Workspace directory */}
          {workingDirectory && (
            <div className="flex items-center gap-1.5 text-xs opacity-90">
              <Folder className="w-3 h-3" />
              <span className="truncate">{workingDirectory}</span>
            </div>
          )}
          
          {/* Session metadata */}
          {sessionData && !isLoading && (
            <div className="flex flex-col gap-1 text-xs opacity-90">
              {sessionData.createdAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3 h-3" />
                  <span>{formatMessageTimestamp(sessionData.createdAt)}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3" />
                <span>{sessionData.messageCount} messages</span>
              </div>
              {sessionData.totalTokens > 0 && (
                <div className="flex items-center gap-1.5">
                  <Target className="w-3 h-3" />
                  <span>{sessionData.totalTokens.toLocaleString()} tokens</span>
                </div>
              )}
            </div>
          )}
          
          {/* Loading state */}
          {isLoading && (
            <div className="text-xs opacity-70">Loading session details...</div>
          )}
          
          {/* New session indicator */}
          {(!sessionData || tab.sessionId.startsWith('temp_') || tab.sessionId.startsWith('new_')) && !isLoading && (
            <div className="text-xs opacity-70">New session</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  className,
  sidebarCollapsed = false,
  workingDirectory
}) => {
  const navigate = useNavigate();
  return (
    <div className={cn(
      "flex items-center",
      "min-h-[36px] gap-1.5 overflow-x-auto tab-bar-container py-1",
      "transition-all duration-200", 
      // Adjust padding based on sidebar state - extra left padding when sidebar is collapsed for macOS stoplight buttons
      sidebarCollapsed ? "pl-3 pr-3" : "px-3",
      className
    )}>
      {/* Tabs */}
      {tabs.map((tab) => (
        <TabTooltip key={tab.id} tab={tab} workingDirectory={workingDirectory}>
          <button
            className={cn(
              "h-7 cursor-pointer no-drag border-0 rounded-2xl flex items-center",
              "w-36 group relative tab-item",
              "transition-colors duration-200",
              // Selected tab: darker background with blur
              tab.isActive
                ? "bg-zinc-900 dark:bg-zinc-900 backdrop-blur-xl"
                // Unselected tabs: slightly transparent with blur
                : "bg-neutral-900/70 dark:bg-neutral-900/70 backdrop-blur-[10px] hover:bg-neutral-800/80"
            )}
            onClick={() => onTabClick(tab.id)}
          >
            {/* Collaborative indicator - blue dot for active sessions */}
            {(tab.isCollaborative || tab.isCollaborativeJoin) && (
              <div className="flex-shrink-0 w-4 pl-2 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Collaborative session" />
              </div>
            )}

            {/* Tab Title - with explicit padding */}
            <div className="flex-1 min-w-0 pl-3">
              <span className={cn(
                "truncate text-xs font-medium block pointer-events-none text-left",
                // Collaborative tabs get blue tint
                tab.isCollaborative || tab.isCollaborativeJoin
                  ? tab.isActive
                    ? "text-blue-300"
                    : "text-blue-400/70 group-hover:text-blue-300"
                  : tab.isActive
                    // Selected: white text
                    ? "text-white"
                    // Unselected: gray text (Inactive-Menu color)
                    : "text-zinc-500 group-hover:text-zinc-300"
              )}>
                {getTabTitle(tab)}
              </span>
            </div>

            {/* Close Button - Always reserve space, only show icon when active */}
            <div className="flex-shrink-0 w-5 pr-2 flex items-center justify-center">
              {tab.isActive && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose(tab.id);
                  }}
                  className="flex items-center justify-center tab-close-button pointer-events-auto opacity-70 hover:opacity-100"
                  title="Close tab"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              )}
            </div>
          </button>
        </TabTooltip>
      ))}

      {/* New Tab Button - matches tab styling */}
      <button
        onClick={onNewTab}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-2xl",
          "bg-neutral-900/70 dark:bg-neutral-900/70 backdrop-blur-[10px]",
          "hover:bg-neutral-800/80 transition-colors duration-200",
          "text-zinc-500 hover:text-zinc-300"
        )}
        title="New tab (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* History Button - icon only, next to Plus */}
      <button
        onClick={() => navigate('/sessions')}
        className={cn(
          "flex items-center justify-center w-7 h-7 rounded-2xl",
          "bg-neutral-900/70 dark:bg-neutral-900/70 backdrop-blur-[10px]",
          "hover:bg-neutral-800/80 transition-colors duration-200",
          "text-zinc-500 hover:text-zinc-300"
        )}
        title="View History"
      >
        <History className="w-3.5 h-3.5" />
      </button>

      {/* Spacer to push content left */}
      <div className="flex-1" />
      
      {/* Optional future controls can go here */}
    </div>
  );
};

export default TabBar;
