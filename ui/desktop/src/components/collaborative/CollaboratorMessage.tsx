/**
 * CollaboratorMessage
 * 
 * Renders a single message from a collaborator in a collaborative agent session.
 * Designed as a modular component that can be displayed inline or in a sidebar.
 */

import React from 'react';
import { SessionHumanMessage } from '../../services/collaborativeSessionService';

// =============================================================================
// Types
// =============================================================================

export interface CollaboratorMessageProps {
  message: SessionHumanMessage;
  /** Whether this message is from the current user */
  isFromSelf: boolean;
  /** Whether to show the header (avatar, name, time) */
  showHeader?: boolean;
  /** Whether this message triggered the agent (contained @goose) */
  isGooseTrigger?: boolean;
  /** Optional: custom class name */
  className?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name?: string, email?: string): string {
  const source = name || email || '??';
  return source.slice(0, 2).toUpperCase();
}

function getAvatarGradient(userId: string): string {
  // Generate a consistent gradient based on user ID
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'from-blue-500/30 to-purple-500/30',
    'from-green-500/30 to-teal-500/30',
    'from-orange-500/30 to-red-500/30',
    'from-pink-500/30 to-rose-500/30',
    'from-indigo-500/30 to-blue-500/30',
    'from-yellow-500/30 to-orange-500/30',
    'from-cyan-500/30 to-blue-500/30',
    'from-violet-500/30 to-purple-500/30',
  ];
  return gradients[hash % gradients.length];
}

// =============================================================================
// Components
// =============================================================================

/**
 * System message (join/leave notifications)
 */
export const SystemMessage: React.FC<{
  message: SessionHumanMessage;
  className?: string;
}> = ({ message, className = '' }) => {
  return (
    <div className={`flex justify-center py-2 ${className}`}>
      <div className="px-3 py-1 rounded-full bg-background-muted/50 text-xs text-text-muted italic">
        {message.content}
      </div>
    </div>
  );
};

/**
 * User/Collaborator message
 */
export const CollaboratorMessage: React.FC<CollaboratorMessageProps> = ({
  message,
  isFromSelf,
  showHeader = true,
  isGooseTrigger = false,
  className = '',
}) => {
  // Handle system messages differently
  if (message.message_type === 'system') {
    return <SystemMessage message={message} className={className} />;
  }

  const displayName = message.user_display_name || message.user_email || 'Collaborator';
  const initials = getInitials(message.user_display_name, message.user_email);
  const gradient = getAvatarGradient(message.user_id);

  return (
    <div
      className={`flex gap-3 px-2 py-1.5 rounded-lg hover:bg-background-muted/30 transition-colors ${className}`}
    >
      {/* Avatar */}
      {showHeader ? (
        <div
          className={`h-8 w-8 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-xs font-medium shrink-0`}
        >
          {initials}
        </div>
      ) : (
        <div className="w-8 shrink-0" /> // Spacer for alignment
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        {showHeader && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className={`font-medium text-sm ${isFromSelf ? 'text-primary' : 'text-text-default'}`}>
              {isFromSelf ? 'You' : displayName}
            </span>
            <span className="text-xs text-text-muted">{formatTime(message.created_at)}</span>
            {isGooseTrigger && (
              <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                @goose
              </span>
            )}
          </div>
        )}

        {/* Message content */}
        <div
          className={`text-sm whitespace-pre-wrap break-words ${
            isGooseTrigger ? 'text-text-default' : 'text-text-muted'
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
};

/**
 * Compact collaborator message (for inline display between agent messages)
 */
export const CompactCollaboratorMessage: React.FC<CollaboratorMessageProps> = ({
  message,
  isFromSelf,
  isGooseTrigger = false,
  className = '',
}) => {
  if (message.message_type === 'system') {
    return <SystemMessage message={message} className={className} />;
  }

  const displayName = message.user_display_name || message.user_email || 'Collaborator';
  const initials = getInitials(message.user_display_name, message.user_email);
  const gradient = getAvatarGradient(message.user_id);

  return (
    <div
      className={`flex items-start gap-2 py-1 px-2 rounded-md bg-background-muted/20 border-l-2 ${
        isGooseTrigger ? 'border-green-500/50' : 'border-primary/30'
      } ${className}`}
    >
      {/* Small avatar */}
      <div
        className={`h-5 w-5 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5`}
      >
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${isFromSelf ? 'text-primary' : 'text-text-muted'}`}>
          {isFromSelf ? 'You' : displayName}
        </span>
        <span className="text-xs text-text-muted mx-1">·</span>
        <span className="text-xs text-text-muted">{formatTime(message.created_at)}</span>
        {isGooseTrigger && (
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1 py-0.5 rounded ml-1">
            @goose
          </span>
        )}
        <div className="text-sm text-text-default mt-0.5 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
};

export default CollaboratorMessage;

