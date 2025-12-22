/**
 * CollaborativeSessionBar
 * 
 * A bar that appears when a collaborative session is active.
 * Shows participants, session status, and provides controls.
 */

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { SessionParticipant } from '../../services/collaborativeSessionService';
import { CollabInviteModal } from './CollabInviteModal';

// =============================================================================
// Types
// =============================================================================

export interface CollaborativeSessionBarProps {
  /** Session title */
  title?: string;
  /** Active participants */
  participants: SessionParticipant[];
  /** Current user's ID */
  currentUserId?: string;
  /** Whether user is the host */
  isHost: boolean;
  /** Whether collaborative mode is on (agent only responds to @goose) */
  collaborativeMode: boolean;
  /** Callback to toggle collaborative mode */
  onToggleCollaborativeMode: () => void;
  /** Callback to create an invite */
  onCreateInvite: (targetEmail?: string) => Promise<string>;
  /** Callback to leave session */
  onLeave: () => void;
  /** Callback to end session (host only) */
  onEnd: () => void;
  /** Optional class name */
  className?: string;
}

// =============================================================================
// Local Icons
// =============================================================================

const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const PlusIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const LogOutIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// =============================================================================
// Component
// =============================================================================

export const CollaborativeSessionBar: React.FC<CollaborativeSessionBarProps> = ({
  title,
  participants,
  currentUserId,
  isHost,
  collaborativeMode,
  onToggleCollaborativeMode,
  onCreateInvite,
  onLeave,
  onEnd,
  className = '',
}) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const activeParticipants = participants.filter((p) => p.is_active);

  return (
    <>
      <div
        className={`flex items-center justify-between px-4 py-2 bg-gradient-to-r from-primary/10 to-purple-500/10 border-b border-primary/20 ${className}`}
      >
        {/* Left: Session info and participants */}
        <div className="flex items-center gap-3">
          {/* Live indicator */}
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-400">Live</span>
          </div>

          {/* Title */}
          {title && (
            <span className="text-sm font-medium text-text-default">{title}</span>
          )}

          {/* Participants */}
          <div className="flex items-center gap-1.5">
            <UsersIcon size={14} />
            <div className="flex -space-x-2">
              {activeParticipants.slice(0, 4).map((p) => {
                const initials = (p.display_name || p.email || '??').slice(0, 2).toUpperCase();
                const isCurrentUser = p.user_id === currentUserId;
                const isHostUser = p.role === 'host';

                return (
                  <div
                    key={p.user_id}
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium border-2 border-background-default ${
                      isHostUser
                        ? 'bg-yellow-500/30 text-yellow-200'
                        : isCurrentUser
                          ? 'bg-primary/30 text-primary'
                          : 'bg-background-muted text-text-muted'
                    }`}
                    title={`${p.display_name || p.email}${isHostUser ? ' (Host)' : ''}${isCurrentUser ? ' (You)' : ''}`}
                  >
                    {initials}
                  </div>
                );
              })}
              {activeParticipants.length > 4 && (
                <div className="h-6 w-6 rounded-full bg-background-muted flex items-center justify-center text-[10px] text-text-muted border-2 border-background-default">
                  +{activeParticipants.length - 4}
                </div>
              )}
            </div>
            <span className="text-xs text-text-muted">
              {activeParticipants.length} {activeParticipants.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Collaborative mode toggle */}
          <div className="flex items-center gap-1.5 mr-2">
            <button
              onClick={onToggleCollaborativeMode}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                collaborativeMode ? 'bg-primary' : 'bg-background-muted'
              }`}
              disabled={!isHost}
              title={collaborativeMode ? 'Agent responds only to @goose' : 'Agent responds to all messages'}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  collaborativeMode ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs text-text-muted">
              {collaborativeMode ? '@goose mode' : 'Auto-respond'}
            </span>
          </div>

          {/* Invite button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1"
            onClick={() => setIsInviteModalOpen(true)}
          >
            <PlusIcon size={14} />
            <span className="text-xs">Invite</span>
          </Button>

          {/* Leave/End button */}
          {isHost ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1 text-destructive hover:text-destructive"
              onClick={onEnd}
            >
              <LogOutIcon size={14} />
              <span className="text-xs">End Session</span>
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={onLeave}
            >
              <LogOutIcon size={14} />
              <span className="text-xs">Leave</span>
            </Button>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      <CollabInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        sessionTitle={title}
        onCreateInvite={onCreateInvite}
      />
    </>
  );
};

export default CollaborativeSessionBar;

