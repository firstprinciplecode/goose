/**
 * NotificationDropdown
 * 
 * Dropdown component for the notification bell icon.
 * Shows pending collaborative session invites with accept/decline actions.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabase } from '../contexts/SupabaseContext';
import { useTabContext } from '../contexts/TabContext';
import {
  SessionInvite,
  acceptInvite,
  declineInvite,
  getPendingInvites,
  subscribeToIncomingInvites,
} from '../services/collaborativeSessionService';

// Import the bell icon
import BellIcon from '../assets/bell.svg';

// Local icons
const UsersIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const CheckIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface NotificationDropdownProps {
  className?: string;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  className = '',
}) => {
  const { client, user, isEnabled } = useSupabase();
  const { openExistingSession } = useTabContext();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<SessionInvite[]>([]);
  const [processingInvites, setProcessingInvites] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Load pending invites on mount
  useEffect(() => {
    if (!client || !user || !isEnabled) {
      console.log('[NotificationDropdown] Not loading invites - missing:', { 
        hasClient: !!client, 
        hasUser: !!user, 
        isEnabled 
      });
      return;
    }

    const loadInvites = async () => {
      try {
        console.log('[NotificationDropdown] Loading pending invites for user:', user.id, 'email:', user.email);
        const invites = await getPendingInvites(client, user.id, user.email || undefined);
        console.log('[NotificationDropdown] Loaded invites:', invites.length, invites);
        
        // Deduplicate by ID first
        const byId = invites.filter(
          (invite, index, self) => index === self.findIndex((i) => i.id === invite.id)
        );
        
        // Also deduplicate by session_id (only show one invite per session)
        const uniqueInvites = byId.filter(
          (invite, index, self) => index === self.findIndex((i) => i.session_id === invite.session_id)
        );
        
        if (uniqueInvites.length !== invites.length) {
          console.warn('[NotificationDropdown] Deduped invites from', invites.length, 'to', uniqueInvites.length);
        }
        
        // MERGE with existing instead of replacing (preserves invites found by polling)
        setPendingInvites((prev) => {
          const existingIds = new Set(prev.map(p => p.id));
          const newInvites = uniqueInvites.filter(i => !existingIds.has(i.id));
          
          // If we found new invites, add them
          if (newInvites.length > 0) {
            console.log('[NotificationDropdown] Load found new invites:', newInvites.length);
            return [...prev, ...newInvites];
          }
          
          // If server returned fewer invites than we have, update to server state
          // (handles accepted/expired invites being removed)
          if (uniqueInvites.length < prev.length) {
            const serverIds = new Set(uniqueInvites.map(i => i.id));
            return prev.filter(p => serverIds.has(p.id));
          }
          
          return prev;
        });
      } catch (e) {
        console.error('[NotificationDropdown] Failed to load pending invites:', e);
      }
    };

    void loadInvites();
  }, [client, user, isEnabled]);

  // Poll for invites as a fallback (every 5 seconds)
  useEffect(() => {
    if (!client || !user || !isEnabled) return;

    const pollInvites = async () => {
      try {
        const invites = await getPendingInvites(client, user.id, user.email || undefined);
        console.log('[NotificationDropdown] 🔄 Poll result:', invites.length, 'pending, current state:', pendingInvites.length);
        
        if (invites.length > 0) {
          console.log('[NotificationDropdown] 📋 Invite details:', invites.map(i => ({
            id: i.id,
            session_id: i.session_id,
            status: i.status,
            goose_session_id: i.goose_session_id,
          })));
        }
        
        setPendingInvites((prev) => {
          // Merge with existing, avoiding duplicates by ID AND session_id
          const existingIds = new Set(prev.map(p => p.id));
          const existingSessionIds = new Set(prev.map(p => p.session_id));
          const newInvites = invites.filter(i => 
            !existingIds.has(i.id) && !existingSessionIds.has(i.session_id)
          );
          if (newInvites.length > 0) {
            console.log('[NotificationDropdown] Poll found new invites:', newInvites.length);
            return [...prev, ...newInvites];
          }
          // Don't remove invites if poll returns 0 - keep existing state
          // (Supabase queries can be inconsistent)
          return prev;
        });
      } catch (e: any) {
        console.error('[NotificationDropdown] 🔴 Poll error:', e?.message || e);
      }
    };

    const pollInterval = setInterval(pollInvites, 5000);
    return () => clearInterval(pollInterval);
  }, [client, user, isEnabled]);

  // Subscribe to incoming invites (realtime)
  useEffect(() => {
    if (!client || !user || !isEnabled) return;

    console.log('[NotificationDropdown] Subscribing to incoming invites for user:', user.id);
    const channel = subscribeToIncomingInvites(client, user.id, (invite) => {
      console.log('[NotificationDropdown] 🔔 REALTIME: Received new invite:', invite);
      setPendingInvites((prev) => {
        // Avoid duplicates by ID or session_id
        if (prev.some((p) => p.id === invite.id || p.session_id === invite.session_id)) {
          console.log('[NotificationDropdown] Skipping duplicate invite:', invite.id);
          return prev;
        }
        return [...prev, invite];
      });
    });

    return () => {
      console.log('[NotificationDropdown] Unsubscribing from invites');
      client.removeChannel(channel);
    };
  }, [client, user, isEnabled]);

  const handleAccept = useCallback(async (invite: SessionInvite) => {
    console.log('[NotificationDropdown] Accept clicked for invite:', invite.id);
    
    if (!client) {
      console.error('[NotificationDropdown] No Supabase client');
      return;
    }
    
    if (processingInvites.has(invite.id)) {
      console.log('[NotificationDropdown] Already processing this invite');
      return;
    }

    setProcessingInvites((prev) => new Set(prev).add(invite.id));

    try {
      console.log('[NotificationDropdown] Calling acceptInvite RPC...');
      const collabSessionId = await acceptInvite(client, invite.id);
      console.log('[NotificationDropdown] ✅ Accepted invite, collab session:', collabSessionId);
      console.log('[NotificationDropdown] Invite details:', {
        goose_session_id: invite.goose_session_id,
        session_title: invite.session_title,
        session_id: invite.session_id,
      });

      // Remove from pending
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));
      setIsOpen(false);

      // Open the Goose session in a new tab
      if (invite.goose_session_id) {
        const sessionTitle = invite.session_title || `Collab: ${invite.goose_session_id.slice(0, 8)}`;
        console.log('[NotificationDropdown] 📂 Opening session tab:', invite.goose_session_id, 'title:', sessionTitle, 'isCollaborativeJoin: true');
        openExistingSession(invite.goose_session_id, sessionTitle, true).then((result) => {
          if (!result.success && result.error === 'FOLDER_MISMATCH') {
            console.warn('[NotificationDropdown] Folder mismatch when opening collaborative session');
          }
          // Tell BaseChat2 to join the exact collab session id immediately.
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('collab-session-joined', {
                detail: { gooseSessionId: invite.goose_session_id, collabSessionId },
              })
            );
          }, 50);
        }).catch((error) => {
          console.error('[NotificationDropdown] Failed to open session tab:', error);
        });
      } else {
        console.warn('[NotificationDropdown] No goose_session_id in invite, cannot open tab');
        // Still mark as accepted - the invite was processed
        alert('Invite accepted, but could not open session tab. The goose_session_id is missing.');
      }
    } catch (e: any) {
      console.error('[NotificationDropdown] ❌ Failed to accept invite:', e);
      console.error('[NotificationDropdown] Error details:', e?.message, e?.code, e?.details);
      alert(`Failed to accept invite: ${e?.message || 'Unknown error'}`);
    } finally {
      setProcessingInvites((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
    }
  }, [client, processingInvites, openExistingSession]);

  const handleDecline = useCallback(async (invite: SessionInvite) => {
    if (!client || processingInvites.has(invite.id)) return;

    setProcessingInvites((prev) => new Set(prev).add(invite.id));

    try {
      await declineInvite(client, invite.id);
      setPendingInvites((prev) => prev.filter((p) => p.id !== invite.id));
    } catch (e) {
      console.error('[NotificationDropdown] Failed to decline invite:', e);
    } finally {
      setProcessingInvites((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
    }
  }, [client, processingInvites]);

  const hasNotifications = pendingInvites.length > 0;

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Bell button with badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10 dark:hover:bg-white/10 transition-colors relative"
        title="Notifications"
      >
        <img 
          src={BellIcon} 
          alt="Notifications" 
          className={`w-6 h-6 transition-opacity ${hasNotifications ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`} 
        />
        
        {/* Notification badge */}
        {hasNotifications && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1">
            {pendingInvites.length > 9 ? '9+' : pendingInvites.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-80 bg-background-default border border-border/60 rounded-xl shadow-xl overflow-hidden z-[200]"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/40 bg-gradient-to-r from-blue-500/5 to-purple-500/5">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {hasNotifications && (
                <p className="text-xs text-text-muted mt-0.5">
                  {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-y-auto">
              {pendingInvites.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-border/20 flex items-center justify-center">
                    <UsersIcon size={24} />
                  </div>
                  <p className="text-sm text-text-muted">No notifications</p>
                  <p className="text-xs text-text-muted/60 mt-1">
                    Collaboration invites will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {pendingInvites.map((invite) => {
                    const isProcessing = processingInvites.has(invite.id);
                    const inviterName = invite.inviter_display_name || invite.inviter_email || 'Someone';
                    const sessionTitle = invite.session_title || 'Goose session';

                    return (
                      <div key={invite.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
                        {/* Invite header */}
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center flex-shrink-0">
                            <UsersIcon size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {inviterName}
                            </p>
                            <p className="text-xs text-text-muted mt-0.5">
                              Invited you to <span className="font-medium">{sessionTitle}</span>
                            </p>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 mt-3 ml-12">
                          <button
                            onClick={() => void handleDecline(invite)}
                            disabled={isProcessing}
                            className="flex-1 h-8 px-3 text-xs font-medium rounded-lg border border-border/60 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                          >
                            <XIcon size={12} />
                            Decline
                          </button>
                          <button
                            onClick={() => void handleAccept(invite)}
                            disabled={isProcessing}
                            className="flex-1 h-8 px-3 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                          >
                            {isProcessing ? (
                              'Joining...'
                            ) : (
                              <>
                                <CheckIcon size={12} />
                                Join
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer - only show if Supabase is not enabled */}
            {!isEnabled && (
              <div className="px-4 py-2 border-t border-border/40 bg-yellow-500/10">
                <p className="text-xs text-yellow-500/80 text-center">
                  Sign in to Team to receive collaboration invites
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationDropdown;

