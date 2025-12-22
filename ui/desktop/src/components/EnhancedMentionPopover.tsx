import { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { FileIcon } from './FileIcon';
import { Users } from 'lucide-react';
import { useMatrix } from '../contexts/MatrixContext';
import { useSupabase } from '../contexts/SupabaseContext';
import { getConnectedUsers, ConnectedUser } from '../services/collaborativeSessionService';
import GooseIcon from '../images/loading-goose/1.svg';

interface MentionItem {
  id: string;
  type: 'file' | 'friend' | 'connected-user';
  name: string;
  displayText: string;
  secondaryText?: string;
  path?: string; // For files
  userId?: string; // For friends or connected users
  matchScore: number;
}

interface EnhancedMentionPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFile: (filePath: string) => void;
  onInviteFriend: (friendUserId: string) => void;
  position: { x: number; y: number };
  query: string;
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

// Simple fuzzy matching
const fuzzyMatch = (pattern: string, text: string): number => {
  if (!pattern) return 0;
  
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match gets highest score
  if (textLower.includes(patternLower)) {
    return 100 - (text.length - pattern.length);
  }
  
  // Character-by-character matching
  let score = 0;
  let patternIndex = 0;
  
  for (let i = 0; i < textLower.length && patternIndex < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIndex]) {
      score += 10;
      patternIndex++;
    }
  }
  
  // Only return score if all pattern characters matched
  return patternIndex === patternLower.length ? score : -1;
};

const EnhancedMentionPopover = forwardRef<
  { 
    getDisplayItems: () => MentionItem[];
    selectItem: (index: number) => void;
  },
  EnhancedMentionPopoverProps
>(({ 
  isOpen, 
  onClose, 
  onSelectFile, 
  onInviteFriend, 
  position, 
  query, 
  selectedIndex, 
  onSelectedIndexChange 
}, ref) => {
  const { friends, isConnected } = useMatrix();
  const { client: supabaseClient, session: supabaseSession, isEnabled: supabaseEnabled } = useSupabase();
  const [connectedUsers, setConnectedUsers] = useState<ConnectedUser[]>([]);
  const [recentFiles] = useState<string[]>([
    'README.md',
    'package.json',
    'src/App.tsx',
    'src/components/ChatInput.tsx',
    'docs/setup.md'
  ]); // Mock recent files for now
  
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch connected users from Supabase (people who share Team channels)
  useEffect(() => {
    console.log('[Mention] Checking connected users fetch conditions:', {
      isOpen,
      hasSupabaseClient: !!supabaseClient,
      supabaseEnabled,
      userId: supabaseSession?.user?.id,
    });
    
    if (!isOpen || !supabaseClient || !supabaseSession?.user?.id || !supabaseEnabled) {
      if (isOpen) {
        console.log('[Mention] Skipping connected users fetch - Supabase not ready. You may need to sign into Team first.');
      }
      return;
    }
    
    const fetchConnectedUsers = async () => {
      try {
        console.log('[Mention] Fetching connected users for:', supabaseSession.user.id);
        const users = await getConnectedUsers(supabaseClient, supabaseSession.user.id);
        console.log('[Mention] Loaded connected users:', users.length, users);
        setConnectedUsers(users);
      } catch (e) {
        console.error('[Mention] Failed to load connected users:', e);
      }
    };
    
    void fetchConnectedUsers();
  }, [isOpen, supabaseClient, supabaseSession?.user?.id, supabaseEnabled]);

  // Combine friends, goose, connected users, and files into mention items
  const mentionItems = useMemo((): MentionItem[] => {
    const items: MentionItem[] = [];
    
    // Add "goose" commands as special mentions for AI control
    const gooseCommands = [
      {
        command: 'goose',
        description: 'Enable AI assistance',
        emoji: '🦆'
      },
      {
        command: 'goose off',
        description: 'Disable AI assistance',
        emoji: '🦆💤'
      },
      {
        command: 'goose stop',
        description: 'Stop AI assistance',
        emoji: '🦆🛑'
      },
      {
        command: 'goose quiet',
        description: 'Make AI quiet',
        emoji: '🦆🤫'
      }
    ];

    gooseCommands.forEach(({ command, description }) => {
      const score = fuzzyMatch(query, command);
      if (score > 0 || !query.trim()) {
        items.push({
          id: command,
          type: 'friend', // Use friend type for consistent styling
          name: command,
          displayText: command,
          secondaryText: description,
          userId: command,
          matchScore: score + 100, // Highest priority for goose commands
        });
      }
    });

    // Add Supabase connected users (Team contacts) - prioritize these
    connectedUsers.forEach(user => {
      const displayName = user.displayName || user.email?.split('@')[0] || user.userId.slice(0, 8);
      const score = fuzzyMatch(query, displayName);
      
      if (score > 0 || !query.trim()) {
        items.push({
          id: `supabase:${user.userId}`,
          type: 'connected-user',
          name: displayName,
          displayText: displayName,
          secondaryText: user.email ? `Invite to collaborate • ${user.email}` : 'Invite to collaborate',
          userId: user.userId,
          matchScore: score + 75, // Higher priority than Matrix friends
        });
      }
    });
    
    // Add Matrix friends (if connected)
    if (isConnected && friends.length > 0) {
      friends.forEach(friend => {
        const displayName = friend.displayName || friend.userId.split(':')[0].substring(1);
        const score = fuzzyMatch(query, displayName);
        
        if (score > 0 || !query.trim()) {
          items.push({
            id: friend.userId,
            type: 'friend',
            name: displayName,
            displayText: displayName,
            secondaryText: `Invite to session • ${friend.userId}`,
            userId: friend.userId,
            matchScore: score + 50, // Boost friends in ranking
          });
        }
      });
    }
    
    // Add recent files
    recentFiles.forEach(filePath => {
      const fileName = filePath.split('/').pop() || filePath;
      const score = fuzzyMatch(query, fileName);
      
      if (score > 0 || !query.trim()) {
        items.push({
          id: filePath,
          type: 'file',
          name: fileName,
          displayText: fileName,
          secondaryText: filePath,
          path: filePath,
          matchScore: score,
        });
      }
    });
    
    // Sort by match score (higher is better)
    return items
      .filter(item => item.matchScore >= 0)
      .sort((a, b) => {
        // Prioritize people when query is short
        if (query.length <= 2) {
          if ((a.type === 'friend' || a.type === 'connected-user') && b.type === 'file') return -1;
          if (a.type === 'file' && (b.type === 'friend' || b.type === 'connected-user')) return 1;
        }
        return b.matchScore - a.matchScore;
      })
      .slice(0, 8); // Show max 8 items
  }, [friends, isConnected, connectedUsers, query, recentFiles]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    getDisplayItems: () => mentionItems,
    selectItem: (index: number) => {
      const item = mentionItems[index];
      if (!item) return;
      
      if ((item.type === 'friend' || item.type === 'connected-user') && item.userId) {
        onInviteFriend(item.userId);
      } else if (item.type === 'file' && item.path) {
        onSelectFile(item.path);
      }
      onClose();
    },
  }), [mentionItems, onInviteFriend, onSelectFile, onClose]);

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleItemClick = (index: number) => {
    onSelectedIndexChange(index);
    const item = mentionItems[index];
    if (!item) return;
    
    if ((item.type === 'friend' || item.type === 'connected-user') && item.userId) {
      onInviteFriend(item.userId);
    } else if (item.type === 'file' && item.path) {
      onSelectFile(item.path);
    }
    onClose();
  };

  // Debug logging
  console.log('🔍 EnhancedMentionPopover render:', { 
    isOpen, 
    position, 
    query, 
    mentionItemsLength: mentionItems.length,
    selectedIndex,
    connectedUsersCount: connectedUsers.length,
    supabaseEnabled,
    hasSession: !!supabaseSession,
  });

  if (!isOpen) return null;

  // Always render to document.body for reliable positioning
  const renderTarget = document.body;

  const popoverContent = (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-background-default border border-border-default rounded-lg shadow-lg min-w-80 max-w-md pointer-events-auto"
      style={{
        left: '50%',
        bottom: '120px', // Position above the chat input with enough space
        transform: 'translateX(-50%)', // Center horizontally
        maxHeight: '300px',
        overflowY: 'auto',
      }}
    >
      <div className="p-3">
        {mentionItems.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-sm">
            {query ? (
              <>No matches for "{query}"</>
            ) : connectedUsers.length > 0 || (isConnected && friends.length > 0) ? (
              <>Type to search files or people</>
            ) : (
              <>Join a Team channel to invite people</>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-xs font-medium text-text-muted mb-2 px-1">
              {query ? `Results for "${query}"` : 'Recent files & friends'}
            </div>
            
            {/* Items */}
            <div ref={listRef} className="space-y-1">
              {mentionItems.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(index)}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                    index === selectedIndex
                      ? 'bg-background-accent text-text-on-accent'
                      : 'hover:bg-background-medium'
                  }`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {item.type === 'connected-user' ? (
                      // Supabase connected user - purple gradient avatar
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-xs font-medium">
                        {item.name.slice(0, 2).toUpperCase()}
                      </div>
                    ) : item.type === 'friend' ? (
                      item.userId?.startsWith('goose') ? (
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          item.userId.includes('off') || item.userId.includes('stop') || item.userId.includes('quiet') 
                            ? 'bg-gray-500' 
                            : 'bg-green-500'
                        }`}>
                          <img 
                            src={GooseIcon} 
                            alt="Goose" 
                            className="w-4 h-4 brightness-0 invert"
                          />
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                          <Users className="w-3 h-3 text-white" />
                        </div>
                      )
                    ) : (
                      <div className="w-6 h-6 flex items-center justify-center">
                        <FileIcon fileName={item.name} isDirectory={false} />
                      </div>
                    )}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {item.displayText}
                    </div>
                    {item.secondaryText && (
                      <div className={`text-xs truncate ${
                        index === selectedIndex ? 'text-text-on-accent/70' : 'text-text-muted'
                      }`}>
                        {item.secondaryText}
                      </div>
                    )}
                  </div>
                  
                  {/* Action hint */}
                  {item.type === 'friend' && (
                    <div className={`text-xs px-2 py-1 rounded ${
                      index === selectedIndex 
                        ? 'bg-text-on-accent/20 text-text-on-accent' 
                        : item.userId?.startsWith('goose')
                          ? 'bg-green-100 text-green-600' 
                          : 'bg-blue-100 text-blue-600'
                    }`}>
                      {item.userId?.startsWith('goose') ? 'Mention' : 'Invite'}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(popoverContent, renderTarget);
});

EnhancedMentionPopover.displayName = 'EnhancedMentionPopover';

export default EnhancedMentionPopover;
