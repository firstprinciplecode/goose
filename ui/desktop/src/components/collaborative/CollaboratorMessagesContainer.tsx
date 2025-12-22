/**
 * CollaboratorMessagesContainer
 * 
 * Container component for displaying collaborator messages.
 * Supports multiple display modes for flexibility:
 * - 'inline': Messages appear inline within the main chat
 * - 'sidebar': Messages appear in a sidebar panel
 * - 'floating': Messages appear in a floating chat box
 * 
 * This modular design allows easy switching between layouts.
 */

import React, { useRef, useEffect } from 'react';
import { SessionHumanMessage, SessionParticipant } from '../../services/collaborativeSessionService';
import { CollaboratorMessage, CompactCollaboratorMessage } from './CollaboratorMessage';
import { containsGooseMention } from '../../services/collaborativeSessionService';

// =============================================================================
// Types
// =============================================================================

export type DisplayMode = 'inline' | 'sidebar' | 'floating';

export interface CollaboratorMessagesContainerProps {
  /** Display mode for the container */
  displayMode: DisplayMode;
  /** Messages to display */
  messages: SessionHumanMessage[];
  /** Active participants for context */
  participants: SessionParticipant[];
  /** Current user's ID */
  currentUserId?: string;
  /** Whether collaborative mode is active (agent only responds to @goose) */
  collaborativeMode?: boolean;
  /** Whether the session is loading */
  isLoading?: boolean;
  /** Callback when load older is clicked */
  onLoadOlder?: () => void;
  /** Whether there are more messages to load */
  hasMoreMessages?: boolean;
  /** Optional title for the container */
  title?: string;
  /** Optional class name */
  className?: string;
  /** Callback when close is clicked (for floating/sidebar) */
  onClose?: () => void;
}

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Participants bar showing who's in the session
 */
const ParticipantsBar: React.FC<{
  participants: SessionParticipant[];
  currentUserId?: string;
}> = ({ participants, currentUserId }) => {
  const activeParticipants = participants.filter((p) => p.is_active);

  if (activeParticipants.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background-muted/30 border-b border-border/30">
      <span className="text-xs text-text-muted">Participants:</span>
      <div className="flex -space-x-2">
        {activeParticipants.slice(0, 5).map((p) => {
          const isHost = p.role === 'host';
          const isSelf = p.user_id === currentUserId;
          const initials = (p.display_name || p.email || '??').slice(0, 2).toUpperCase();

          return (
            <div
              key={p.user_id}
              className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium border-2 border-background-default ${
                isHost
                  ? 'bg-yellow-500/30 text-yellow-200'
                  : isSelf
                    ? 'bg-primary/30 text-primary'
                    : 'bg-background-muted text-text-muted'
              }`}
              title={`${p.display_name || p.email}${isHost ? ' (Host)' : ''}${isSelf ? ' (You)' : ''}`}
            >
              {initials}
            </div>
          );
        })}
        {activeParticipants.length > 5 && (
          <div className="h-6 w-6 rounded-full bg-background-muted flex items-center justify-center text-[10px] text-text-muted border-2 border-background-default">
            +{activeParticipants.length - 5}
          </div>
        )}
      </div>
      {activeParticipants.length === 1 && (
        <span className="text-xs text-text-muted italic">Only you</span>
      )}
    </div>
  );
};

/**
 * Empty state when no messages
 */
const EmptyState: React.FC<{ collaborativeMode?: boolean }> = ({ collaborativeMode }) => (
  <div className="flex flex-col items-center justify-center h-full text-center p-4">
    <div className="w-12 h-12 rounded-full bg-background-muted flex items-center justify-center mb-3">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
    <p className="text-sm font-medium text-text-default mb-1">Collaborative session active</p>
    <p className="text-xs text-text-muted max-w-[200px]">
      {collaborativeMode
        ? 'Messages from collaborators will appear here. Use @goose to trigger agent responses.'
        : 'Collaborator messages will appear inline with the conversation.'}
    </p>
  </div>
);

// =============================================================================
// Main Container
// =============================================================================

export const CollaboratorMessagesContainer: React.FC<CollaboratorMessagesContainerProps> = ({
  displayMode,
  messages,
  participants,
  currentUserId,
  collaborativeMode = true,
  isLoading = false,
  onLoadOlder,
  hasMoreMessages = false,
  title = 'Collaborators',
  className = '',
  onClose,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Render messages based on display mode
  const renderMessages = () => {
    if (messages.length === 0) {
      return <EmptyState collaborativeMode={collaborativeMode} />;
    }

    return (
      <div className="space-y-1 p-2">
        {/* Load older button */}
        {hasMoreMessages && onLoadOlder && (
          <div className="flex justify-center pb-2">
            <button
              onClick={onLoadOlder}
              disabled={isLoading}
              className="text-xs text-text-muted hover:text-text-default transition-colors px-3 py-1 rounded-full bg-background-muted/30"
            >
              {isLoading ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, idx) => {
          const prevMsg = messages[idx - 1];
          const isFromSelf = msg.user_id === currentUserId;
          const isGooseTrigger = msg.message_type === 'goose_trigger' || containsGooseMention(msg.content);

          // Show header if first message, different sender, or > 5 min gap
          const showHeader =
            !prevMsg ||
            prevMsg.user_id !== msg.user_id ||
            prevMsg.message_type === 'system' ||
            Math.abs(new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) >
              5 * 60 * 1000;

          // Use compact messages for inline mode
          if (displayMode === 'inline') {
            return (
              <CompactCollaboratorMessage
                key={msg.id}
                message={msg}
                isFromSelf={isFromSelf}
                isGooseTrigger={isGooseTrigger}
              />
            );
          }

          return (
            <CollaboratorMessage
              key={msg.id}
              message={msg}
              isFromSelf={isFromSelf}
              showHeader={showHeader}
              isGooseTrigger={isGooseTrigger}
            />
          );
        })}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>
    );
  };

  // ==========================================================================
  // Display Mode Layouts
  // ==========================================================================

  // Inline mode - no container wrapper, just the messages
  if (displayMode === 'inline') {
    return (
      <div className={`collab-messages-inline ${className}`}>
        {messages.length > 0 && (
          <div className="my-3 space-y-1">
            {messages.map((msg, idx) => {
              const prevMsg = messages[idx - 1];
              const isFromSelf = msg.user_id === currentUserId;
              const isGooseTrigger = msg.message_type === 'goose_trigger' || containsGooseMention(msg.content);

              // Always show header for inline mode for clarity
              const showHeader =
                !prevMsg ||
                prevMsg.user_id !== msg.user_id ||
                prevMsg.message_type === 'system';

              return (
                <CompactCollaboratorMessage
                  key={msg.id}
                  message={msg}
                  isFromSelf={isFromSelf}
                  showHeader={showHeader}
                  isGooseTrigger={isGooseTrigger}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Sidebar mode
  if (displayMode === 'sidebar') {
    return (
      <div
        className={`collab-messages-sidebar flex flex-col h-full w-72 border-l border-border/40 bg-background-default/95 backdrop-blur ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <h3 className="font-medium text-sm">{title}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-default transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Participants */}
        <ParticipantsBar participants={participants} currentUserId={currentUserId} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">{renderMessages()}</div>
      </div>
    );
  }

  // Floating mode
  if (displayMode === 'floating') {
    return (
      <div
        className={`collab-messages-floating fixed bottom-20 right-4 w-80 max-h-[60vh] flex flex-col rounded-xl border border-border/60 bg-background-default/95 backdrop-blur shadow-lg z-50 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 rounded-t-xl">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {title}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-text-muted hover:text-text-default transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Participants */}
        <ParticipantsBar participants={participants} currentUserId={currentUserId} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto min-h-[200px]">{renderMessages()}</div>
      </div>
    );
  }

  return null;
};

export default CollaboratorMessagesContainer;

