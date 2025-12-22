/**
 * SessionInviteNotification
 * 
 * Real-time notification component for incoming collaborative session invites.
 * Uses Supabase real-time subscriptions to show instant notifications when
 * a connected user invites you to join their Goose session.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSupabase } from '../../contexts/SupabaseContext';
import {
  SessionInvite,
  acceptInvite,
  declineInvite,
  getPendingInvites,
  subscribeToIncomingInvites,
} from '../../services/collaborativeSessionService';
import { Button } from '../ui/button';

// Local icons
const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const XIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const CheckIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface SessionInviteNotificationProps {
  className?: string;
}

export const SessionInviteNotification: React.FC<SessionInviteNotificationProps> = ({
  className = '',
}) => {
  const navigate = useNavigate();
  const { client, user, isEnabled } = useSupabase();
  const [pendingInvites, setPendingInvites] = useState<SessionInvite[]>([]);
  const [processingInvites, setProcessingInvites] = useState<Set<string>>(new Set());
  const [dismissedInvites, setDismissedInvites] = useState<Set<string>>(new Set());

  // Load pending invites on mount
  useEffect(() => {
    if (!client || !user || !isEnabled) return;

    const loadInvites = async () => {
      try {
        const invites = await getPendingInvites(client, user.id, user.email || undefined);
        setPendingInvites(invites);
      } catch (e) {
        console.error('[SessionInvite] Failed to load pending invites:', e);
      }
    };

    void loadInvites();
  }, [client, user, isEnabled]);

  // Subscribe to incoming invites
  useEffect(() => {
    if (!client || !user || !isEnabled) return;

    const channel = subscribeToIncomingInvites(client, user.id, (invite) => {
      console.log('[SessionInvite] Received new invite:', invite);
      setPendingInvites((prev) => {
        // Avoid duplicates
        if (prev.some((p) => p.id === invite.id)) return prev;
        return [...prev, invite];
      });
    });

    return () => {
      client.removeChannel(channel);
    };
  }, [client, user, isEnabled]);

  const handleAccept = useCallback(async (invite: SessionInvite) => {
    if (!client || processingInvites.has(invite.id)) return;

    setProcessingInvites((prev) => new Set(prev).add(invite.id));

    try {
      const sessionId = await acceptInvite(client, invite.id);
      console.log('[SessionInvite] Accepted invite, joining session:', sessionId);

      // Remove from pending
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));

      // Navigate to the collaborative session
      // The goose_session_id is the local session to open
      if (invite.goose_session_id) {
        // Navigate to pair view with the session
        navigate(`/pair?session=${invite.goose_session_id}&collab=${sessionId}`);
      }
    } catch (e) {
      console.error('[SessionInvite] Failed to accept invite:', e);
    } finally {
      setProcessingInvites((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
    }
  }, [client, processingInvites, navigate]);

  const handleDecline = useCallback(async (invite: SessionInvite) => {
    if (!client || processingInvites.has(invite.id)) return;

    setProcessingInvites((prev) => new Set(prev).add(invite.id));

    try {
      await declineInvite(client, invite.id);
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));
    } catch (e) {
      console.error('[SessionInvite] Failed to decline invite:', e);
    } finally {
      setProcessingInvites((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
    }
  }, [client, processingInvites]);

  const handleDismiss = useCallback((inviteId: string) => {
    setDismissedInvites((prev) => new Set(prev).add(inviteId));
  }, []);

  // Filter out dismissed invites
  const visibleInvites = pendingInvites.filter((i) => !dismissedInvites.has(i.id));

  if (!isEnabled || visibleInvites.length === 0) {
    return null;
  }

  return (
    <div className={`fixed bottom-4 right-4 z-50 space-y-2 max-w-sm ${className}`}>
      <AnimatePresence mode="popLayout">
        {visibleInvites.map((invite) => {
          const isProcessing = processingInvites.has(invite.id);
          const inviterName = invite.inviter_display_name || invite.inviter_email || 'Someone';
          const sessionTitle = invite.session_title || 'a collaborative session';

          return (
            <motion.div
              key={invite.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-background-default border border-border/60 rounded-xl shadow-lg overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-b border-border/30">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center">
                  <UsersIcon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Collaboration Invite</p>
                  <p className="text-xs text-text-muted truncate">
                    from {inviterName}
                  </p>
                </div>
                <button
                  className="text-text-muted hover:text-text-default transition-colors p-1"
                  onClick={() => handleDismiss(invite.id)}
                >
                  <XIcon size={16} />
                </button>
              </div>

              {/* Content */}
              <div className="px-4 py-3 space-y-3">
                <p className="text-sm">
                  <span className="font-medium">{inviterName}</span> invited you to join{' '}
                  <span className="font-medium">{sessionTitle}</span>
                </p>

                <p className="text-xs text-text-muted">
                  You'll be able to chat together with Goose in real-time.
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-9"
                    disabled={isProcessing}
                    onClick={() => void handleDecline(invite)}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-9"
                    disabled={isProcessing}
                    onClick={() => void handleAccept(invite)}
                  >
                    {isProcessing ? (
                      'Joining...'
                    ) : (
                      <>
                        <CheckIcon size={14} />
                        <span className="ml-1">Join</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default SessionInviteNotification;

