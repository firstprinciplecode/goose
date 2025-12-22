/**
 * CollabInviteModal
 * 
 * Modal for inviting users to a collaborative agent session.
 * Supports both creating invite links and direct email invitations.
 */

import React, { useState, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

// Local icon components
const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const LinkIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const CopyIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = ({ size = 16, className = '' }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// =============================================================================
// Types
// =============================================================================

export interface ConnectedUser {
  userId: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
}

export interface CollabInviteModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Session title for display */
  sessionTitle?: string;
  /** Function to create an invite link (for non-connected users) */
  onCreateInvite: (targetEmail?: string) => Promise<string>;
  /** Function to directly invite a connected user */
  onInviteUser?: (userId: string) => Promise<void>;
  /** Connected users who can be invited directly */
  connectedUsers?: ConnectedUser[];
  /** Optional: list of contacts for autocomplete (for email invites) */
  contacts?: { email: string; displayName?: string }[];
}

// =============================================================================
// Component
// =============================================================================

export const CollabInviteModal: React.FC<CollabInviteModalProps> = ({
  isOpen,
  onClose,
  sessionTitle = 'this session',
  onCreateInvite,
  onInviteUser,
  connectedUsers = [],
  contacts = [],
}) => {
  const [targetEmail, setTargetEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEmailRestriction, setShowEmailRestriction] = useState(false);
  const [invitedUsers, setInvitedUsers] = useState<Set<string>>(new Set());
  const [inviteMode, setInviteMode] = useState<'users' | 'link'>(
    connectedUsers.length > 0 ? 'users' : 'link'
  );

  const handleCreateInvite = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCopied(false);

    try {
      const link = await onCreateInvite(showEmailRestriction && targetEmail ? targetEmail : undefined);
      setInviteLink(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invite');
    } finally {
      setIsLoading(false);
    }
  }, [onCreateInvite, targetEmail, showEmailRestriction]);

  const handleInviteUser = useCallback(async (user: ConnectedUser) => {
    if (!onInviteUser || invitedUsers.has(user.userId)) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await onInviteUser(user.userId);
      setInvitedUsers((prev) => new Set(prev).add(user.userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send invite');
    } finally {
      setIsLoading(false);
    }
  }, [onInviteUser, invitedUsers]);

  const handleCopy = useCallback(() => {
    if (!inviteLink) return;
    void navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteLink]);

  const handleClose = useCallback(() => {
    // Reset state on close
    setTargetEmail('');
    setInviteLink(null);
    setError(null);
    setCopied(false);
    setShowEmailRestriction(false);
    setInvitedUsers(new Set());
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-background-default border border-border/60 shadow-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <h3 className="text-lg font-semibold">Invite to Session</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleClose}
          >
            <XIcon size={16} />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {!inviteLink ? (
            <>
              {/* Mode toggle if connected users exist */}
              {connectedUsers.length > 0 && (
                <div className="flex gap-1 p-1 bg-background-muted/50 rounded-lg">
                  <button
                    className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                      inviteMode === 'users'
                        ? 'bg-background-default text-text-default font-medium shadow-sm'
                        : 'text-text-muted hover:text-text-default'
                    }`}
                    onClick={() => setInviteMode('users')}
                  >
                    Connected Users
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 text-sm rounded-md transition-colors ${
                      inviteMode === 'link'
                        ? 'bg-background-default text-text-default font-medium shadow-sm'
                        : 'text-text-muted hover:text-text-default'
                    }`}
                    onClick={() => setInviteMode('link')}
                  >
                    Invite Link
                  </button>
                </div>
              )}

              {/* Connected Users Mode */}
              {inviteMode === 'users' && connectedUsers.length > 0 && (
                <>
                  <p className="text-sm text-text-muted">
                    Invite someone you're connected with to join {sessionTitle}.
                    They'll receive an instant notification.
                  </p>
                  
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {connectedUsers.map((user) => {
                      const isInvited = invitedUsers.has(user.userId);
                      return (
                        <div
                          key={user.userId}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-background-muted/30 hover:bg-background-muted/50 transition-colors"
                        >
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 flex items-center justify-center text-sm font-medium shrink-0">
                            {user.avatarUrl ? (
                              <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              user.displayName.slice(0, 2).toUpperCase()
                            )}
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{user.displayName}</p>
                            {user.email && (
                              <p className="text-xs text-text-muted truncate">{user.email}</p>
                            )}
                          </div>
                          
                          {/* Invite button */}
                          <Button
                            variant={isInvited ? 'ghost' : 'outline'}
                            size="sm"
                            className="shrink-0 h-8"
                            disabled={isLoading || isInvited}
                            onClick={() => void handleInviteUser(user)}
                          >
                            {isInvited ? (
                              <>
                                <CheckIcon size={14} className="text-green-500 mr-1" />
                                Invited
                              </>
                            ) : (
                              'Invite'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  
                  {invitedUsers.size > 0 && (
                    <p className="text-xs text-green-600 dark:text-green-400">
                      ✓ {invitedUsers.size} invite{invitedUsers.size > 1 ? 's' : ''} sent!
                    </p>
                  )}
                </>
              )}

              {/* Link Invite Mode */}
              {(inviteMode === 'link' || connectedUsers.length === 0) && (
                <>
                  <p className="text-sm text-text-muted">
                    Create an invite link to share {sessionTitle} with a collaborator.
                    They'll be able to chat inline and use <code className="text-xs bg-background-muted px-1 py-0.5 rounded">@goose</code> to trigger agent responses.
                  </p>

                  {/* Email restriction toggle */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="restrict-email"
                      checked={showEmailRestriction}
                      onChange={(e) => setShowEmailRestriction(e.target.checked)}
                      className="w-4 h-4 rounded border-border"
                    />
                    <label htmlFor="restrict-email" className="text-sm text-text-muted">
                      Restrict to specific email
                    </label>
                  </div>

                  {/* Email input (conditional) */}
                  {showEmailRestriction && (
                    <div className="space-y-2">
                      <label htmlFor="target-email" className="text-sm font-medium">
                        Email address
                      </label>
                      <Input
                        id="target-email"
                        type="email"
                        placeholder="collaborator@example.com"
                        value={targetEmail}
                        onChange={(e) => setTargetEmail(e.target.value)}
                        className="h-10"
                        list="contacts-list"
                      />
                      {contacts.length > 0 && (
                        <datalist id="contacts-list">
                          {contacts.map((c) => (
                            <option key={c.email} value={c.email}>
                              {c.displayName || c.email}
                            </option>
                          ))}
                        </datalist>
                      )}
                      <p className="text-xs text-text-muted">
                        Only this email will be able to join
                      </p>
                    </div>
                  )}

                  {/* Actions for link mode */}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="ghost" onClick={handleClose}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateInvite}
                      disabled={isLoading || (showEmailRestriction && !targetEmail)}
                    >
                      {isLoading ? 'Creating...' : 'Create Invite Link'}
                    </Button>
                  </div>
                </>
              )}

              {error && (
                <div className="text-xs text-destructive p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                  {error}
                </div>
              )}

              {/* Done button for users mode */}
              {inviteMode === 'users' && connectedUsers.length > 0 && (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={handleClose}>
                    {invitedUsers.size > 0 ? 'Done' : 'Cancel'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-text-muted">
                Share this link with your collaborator. The invite expires in 7 days.
              </p>

              {/* Invite link display */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-background-muted/50 rounded-lg border border-border/30">
                  <LinkIcon size={16} className="text-text-muted shrink-0" />
                  <input
                    type="text"
                    value={inviteLink}
                    readOnly
                    className="flex-1 bg-transparent text-sm text-text-default outline-none"
                    onClick={(e) => e.currentTarget.select()}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <CheckIcon size={16} className="text-green-500" />
                    ) : (
                      <CopyIcon size={16} />
                    )}
                  </Button>
                </div>

                {showEmailRestriction && targetEmail && (
                  <p className="text-xs text-text-muted">
                    Restricted to: <span className="font-medium">{targetEmail}</span>
                  </p>
                )}
              </div>

              {/* Instructions */}
              <div className="text-xs text-text-muted bg-background-muted/30 rounded-lg p-3 space-y-2">
                <p className="font-medium">How it works:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Share the link with your collaborator</li>
                  <li>They'll sign in and join your session</li>
                  <li>Both of you can chat - messages appear inline</li>
                  <li>Use <code className="bg-background-muted px-1 rounded">@goose</code> to get agent responses</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={handleClose}>
                  Done
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setInviteLink(null);
                    setTargetEmail('');
                    setShowEmailRestriction(false);
                  }}
                >
                  Create Another
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollabInviteModal;

