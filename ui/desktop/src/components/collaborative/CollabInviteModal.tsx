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

export interface CollabInviteModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback to close the modal */
  onClose: () => void;
  /** Session title for display */
  sessionTitle?: string;
  /** Function to create an invite link */
  onCreateInvite: (targetEmail?: string) => Promise<string>;
  /** Optional: list of contacts for autocomplete */
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
  contacts = [],
}) => {
  const [targetEmail, setTargetEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEmailRestriction, setShowEmailRestriction] = useState(false);

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

              {error && (
                <div className="text-xs text-destructive p-3 rounded-lg border border-destructive/30 bg-destructive/10">
                  {error}
                </div>
              )}

              {/* Actions */}
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

